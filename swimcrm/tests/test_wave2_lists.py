from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentStatus
from scheduling.services import create_session

from . import factories as f


class Wave2AdminListContractTest(TestCase):
    def setUp(self):
        self.client.force_login(f.make_admin("wave2_admin"))
        self.group = f.make_group("Wave Two Dolphins")
        self.student = f.make_student(
            group=self.group, first="Ada", last="WaveSearch")
        Charge.objects.create(
            student=self.student,
            description="Overdue wave two charge",
            amount_minor=12000,
            currency="PLN",
            due_date=date.today() - timedelta(days=2),
        )

    def test_search_aliases_and_stable_order_are_supported(self):
        legacy = self.client.get("/api/admin/groups/", {"q": "Dolphins"})
        modern = self.client.get(
            "/api/admin/groups/",
            {"search": "Dolphins", "page": 1, "page_size": 20, "order": "name"},
        )

        self.assertEqual(legacy.status_code, 200)
        self.assertEqual(modern.status_code, 200)
        self.assertEqual(
            [row["id"] for row in legacy.json()["groups"]],
            [row["id"] for row in modern.json()["groups"]],
        )

    def test_invalid_filter_and_order_return_structured_field_errors(self):
        invalid_filter = self.client.get(
            "/api/admin/clients/", {"active": "sometimes"})
        invalid_order = self.client.get(
            "/api/admin/payments/", {"order": "private_field"})
        invalid_page = self.client.get(
            "/api/admin/groups/", {"page": "not-an-integer"})

        self.assertEqual(invalid_filter.status_code, 400)
        self.assertEqual(
            invalid_filter.json()["errors"]["active"][0]["code"],
            "invalid_choice",
        )
        self.assertEqual(invalid_order.status_code, 400)
        self.assertEqual(
            invalid_order.json()["errors"]["order"][0]["code"],
            "invalid_choice",
        )
        self.assertEqual(invalid_page.status_code, 400)
        self.assertEqual(
            invalid_page.json()["errors"]["page"][0]["code"],
            "invalid_integer",
        )

    def test_debtors_keep_no_param_shape_and_opt_in_to_pagination(self):
        legacy = self.client.get("/api/admin/debtors/")
        paged = self.client.get(
            "/api/admin/debtors/",
            {"page": 1, "page_size": 20, "search": "WaveSearch", "order": "-balance"},
        )

        self.assertEqual(set(legacy.json()), {"debtors"})
        self.assertNotIn("pagination", legacy.json())
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(paged.json()["pagination"]["page_size"], 20)
        self.assertEqual(paged.json()["pagination"]["total"], 1)
        self.assertEqual(paged.json()["summary"]["balance_minor"], 12000)


class Wave2TrainerListContractTest(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer("wave2_trainer")
        self.group = f.make_group("Wave Two History")
        self.group.default_trainer = self.trainer
        self.group.save(update_fields=["default_trainer"])
        self.past = create_session(
            trainer=self.trainer,
            group=self.group,
            start_at=timezone.now() - timedelta(days=3, hours=1),
            end_at=timezone.now() - timedelta(days=3),
            location="Wave Pool",
            max_participants=10,
        )
        self.client.force_login(self.trainer.user)

    def test_history_keeps_legacy_shape_and_supports_screen_pagination(self):
        legacy = self.client.get("/api/trainer/history/")
        paged = self.client.get(
            "/api/trainer/history/",
            {"page": 1, "page_size": 20, "search": "Wave", "order": "-date"},
        )

        self.assertEqual(set(legacy.json()), {"sessions"})
        self.assertNotIn("pagination", legacy.json())
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(paged.json()["sessions"][0]["id"], self.past.id)
        self.assertEqual(paged.json()["pagination"]["total"], 1)


class Wave2ClientIndependentHistoryTest(TestCase):
    def setUp(self):
        self.parent = f.make_parent("wave2_parent")
        self.group = f.make_group("Wave Two Client")
        self.student = f.make_student(
            parent=self.parent, group=self.group, first="Client", last="Wave")
        trainer = f.make_trainer("wave2_client_trainer")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=timezone.now() - timedelta(days=2, hours=1),
            end_at=timezone.now() - timedelta(days=2),
            location="Client Pool",
            max_participants=10,
        )
        set_attendance(
            session_id=session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
            actor=trainer.user,
        )
        Charge.objects.create(
            student=self.student,
            description="Client charge",
            amount_minor=5000,
            currency="PLN",
            due_date=date.today(),
        )
        Payment.objects.create(
            student=self.student,
            amount_minor=3000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.CONFIRMED,
        )
        self.client.force_login(self.parent.user)

    def test_legacy_combined_payments_shape_is_unchanged(self):
        response = self.client.get(
            "/api/client/payments/", {"student_id": self.student.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.json()),
            {"participant", "student_id", "selection_required", "charges", "payments"},
        )
        self.assertNotIn("pagination", response.json())

    def test_legacy_attendance_shape_is_unchanged(self):
        response = self.client.get(
            "/api/client/attendance/", {"student_id": self.student.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.json()),
            {"participant", "student_id", "selection_required", "attendance"},
        )
        self.assertNotIn("pagination", response.json())

    def test_independent_histories_have_independent_pagination(self):
        common = {"student_id": self.student.id, "page": 1, "page_size": 20}
        attendance = self.client.get("/api/client/attendance/", common)
        charges = self.client.get("/api/client/charges/", common)
        payments = self.client.get("/api/client/payment-history/", common)

        self.assertEqual(attendance.status_code, 200)
        self.assertEqual(charges.status_code, 200)
        self.assertEqual(payments.status_code, 200)
        self.assertEqual(attendance.json()["pagination"]["total"], 1)
        self.assertEqual(charges.json()["pagination"]["total"], 1)
        self.assertEqual(payments.json()["pagination"]["total"], 1)
        self.assertEqual(attendance.json()["student_id"], self.student.id)
        self.assertEqual(charges.json()["student_id"], self.student.id)
        self.assertEqual(payments.json()["student_id"], self.student.id)

    def test_foreign_role_is_forbidden_on_client_history_endpoints(self):
        trainer = f.make_trainer("wave2_forbidden_trainer")
        self.client.force_login(trainer.user)

        for path in (
            "/api/client/attendance/",
            "/api/client/charges/",
            "/api/client/payment-history/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)
