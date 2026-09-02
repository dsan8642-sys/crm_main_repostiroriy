import json
import tempfile
from datetime import date, timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import Consent, ConsentType, ParentAccount, Role
from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from audit.models import AuditLogEntry
from billing.models import (
    Charge, Payment, PaymentEventType, PaymentMethod, PaymentSource, PaymentStatus,
)
from billing.services import student_balance
from dataio.models import ImportBatch, ImportBatchStatus, ImportEffectMode
from notifications.models import (Channel, DeliveryStatus, EventType, NotificationLog,
                                  NotificationRule, NotificationTemplate, QuietHoursPolicy)
from scheduling.models import (Location, Session, SessionParticipant, SessionParticipantStatus,
                               SessionType, SessionTypeConfig, WaitlistEntry,
                               WaitlistStatus)
from scheduling.services import create_session
from students.models import Student
from subscriptions.models import SubscriptionStatus
from subscriptions.services import create_subscription, freeze_subscription, manual_adjust

from . import factories as f


PDF = b"%PDF-1.4\n1 0 obj\n"


class PortalAccessRule(TestCase):
    def setUp(self):
        self.parent = f.make_parent(username="access_parent")
        self.trainer = f.make_trainer(username="access_trainer")
        self.admin = f.make_admin(username="access_admin")

    def test_anonymous_user_cannot_use_role_api(self):
        for url in ["/api/client/overview/", "/api/trainer/sessions/", "/api/admin/dashboard/"]:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 403)
                self.assertIn("error", response.json())

    def test_client_cannot_use_trainer_or_admin_api(self):
        self.client.force_login(self.parent.user)

        trainer_response = self.client.get("/api/trainer/sessions/")
        admin_response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(trainer_response.status_code, 403)
        self.assertEqual(admin_response.status_code, 403)

    def test_trainer_cannot_use_client_or_admin_api(self):
        self.client.force_login(self.trainer.user)

        client_response = self.client.get("/api/client/overview/")
        admin_response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(client_response.status_code, 403)
        self.assertEqual(admin_response.status_code, 403)

    def test_admin_cannot_use_client_or_trainer_cabinet_without_profile(self):
        self.client.force_login(self.admin)

        client_response = self.client.get("/api/client/overview/")
        trainer_response = self.client.get("/api/trainer/sessions/")

        self.assertEqual(client_response.status_code, 403)
        self.assertEqual(trainer_response.status_code, 403)

    def test_invalid_json_returns_api_error(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            "/api/admin/groups/",
            data="{bad json",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())


class ClientPortalApiRule(TestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self._media_override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._media_override.enable()
        self.addCleanup(self._media_override.disable)
        self.addCleanup(self._media_root.cleanup)
        self.parent = f.make_parent(username="parent_a", phone="+48500111111")
        self.other_parent = f.make_parent(username="parent_b", phone="+48500222222")
        self.group = f.make_group("Дельфины")
        self.trainer = f.make_trainer()
        self.student = f.make_student(parent=self.parent, group=self.group, first="Ян", last="Ковальский")
        self.other_student = f.make_student(parent=self.other_parent, group=self.group, first="Ева", last="Новак")
        self.client.force_login(self.parent.user)

    def test_client_overview_only_contains_own_students(self):
        response = self.client.get("/api/client/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["account"]["id"], self.parent.id)
        names = [row["full_name"] for row in response.json()["students"]]
        self.assertIn("Ковальский Ян", names)
        self.assertNotIn("Новак Ева", names)

    def test_client_schedule_contains_sessions_from_every_membership_group(self):
        second_group = f.make_group("Вторая группа")
        self.student.groups.add(second_group)
        first_session = create_session(
            trainer=self.trainer,
            group=self.group,
            start_at=f.dt(2026, 9, 2, 17),
            duration_minutes=60,
            location="Pool A",
            max_participants=10,
        )
        second_session = create_session(
            trainer=self.trainer,
            group=second_group,
            start_at=f.dt(2026, 9, 3, 17),
            duration_minutes=60,
            location="Pool B",
            max_participants=10,
        )

        response = self.client.get(
            "/api/client/schedule/",
            {"date_from": "2026-09-02", "date_to": "2026-09-03"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row["id"] for row in response.json()["sessions"]},
            {first_session.id, second_session.id},
        )

    def test_cancelled_split_participation_does_not_keep_session_visible(self):
        session = create_session(
            trainer=self.trainer,
            individual_student=self.student,
            session_type=SessionType.SPLIT,
            start_at=f.dt(2026, 9, 1, 17),
            duration_minutes=60,
            location="Split visibility",
            max_participants=2,
        )
        participant = SessionParticipant.objects.create(
            session=session,
            student=self.other_student,
        )
        participant.status = SessionParticipantStatus.CANCELLED
        participant.save(update_fields=["status", "updated_at"])
        self.client.force_login(self.other_parent.user)

        schedule = self.client.get(
            "/api/client/schedule/",
            {"date_from": "2026-09-01", "date_to": "2026-09-01"},
        )
        overview = self.client.get("/api/client/overview/")

        self.assertEqual(schedule.status_code, 200)
        self.assertNotIn(session.id, [row["id"] for row in schedule.json()["sessions"]])
        next_session = overview.json()["participants"][0]["next_session"]
        self.assertTrue(next_session is None or next_session["id"] != session.id)

    def test_client_can_update_profile_and_consents(self):
        profile = self.client.post(
            "/api/client/profile/",
            data=json.dumps({"account": {
                "first_name": "Client",
                "last_name": "Updated",
                "email": "client-updated@example.com",
                "phone": "+48500111112",
            }}),
            content_type="application/json",
        )
        consent = self.client.post(
            "/api/client/consents/",
            data=json.dumps({"type": ConsentType.EMAIL, "granted": True, "policy_version": "v1"}),
            content_type="application/json",
        )
        listing = self.client.get("/api/client/consents/")

        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["account"]["email"], "client-updated@example.com")
        self.assertEqual(profile.json()["account"]["preferred_language"], self.parent.preferred_language)
        self.assertEqual(consent.status_code, 200)
        self.assertTrue(consent.json()["is_active"])
        self.assertTrue(any(row["type"] == ConsentType.EMAIL and row["is_active"] for row in listing.json()["consents"]))

    def test_adult_client_without_students_gets_account_holder_participant(self):
        adult = f.make_parent(username="adult_client", phone="+48500333333")
        adult.user.first_name = "Anna"
        adult.user.last_name = "Nowak"
        adult.user.save()
        self.client.force_login(adult.user)

        overview = self.client.get("/api/client/overview/")
        schedule = self.client.get("/api/client/schedule/")
        payments = self.client.get("/api/client/payments/")

        self.assertEqual(overview.status_code, 200)
        self.assertEqual(schedule.status_code, 200)
        self.assertEqual(payments.status_code, 200)
        self.assertEqual(overview.json()["account"]["id"], adult.id)
        participants = overview.json()["participants"]
        self.assertEqual(len(participants), 1)
        self.assertTrue(participants[0]["is_account_holder"])
        self.assertEqual(participants[0]["full_name"], "Nowak Anna")
        self.assertEqual(schedule.json()["sessions"], [])
        self.assertEqual(payments.json()["charges"], [])
        self.assertEqual(payments.json()["payments"], [])
        self.assertEqual(Student.objects.filter(parent=adult, is_account_holder=True).count(), 1)

    def test_adult_client_can_upload_receipt_without_student_id(self):
        adult = f.make_parent(username="adult_receipt", phone="+48500444444")
        self.client.force_login(adult.user)

        response = self.client.post("/api/client/payments/upload-receipt/", {
            "amount_minor": "24000",
            "currency": "PLN",
            "paid_at": date.today().isoformat(),
            "method": "bank_transfer",
            "file": SimpleUploadedFile("receipt.pdf", PDF, content_type="application/pdf"),
        })

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(pk=response.json()["payment"]["id"])
        self.assertTrue(payment.student.is_account_holder)
        self.assertEqual(payment.student.parent, adult)
        self.assertEqual(payment.method, "bank_transfer")
        self.assertEqual(payment.receipts.get().uploaded_by, adult)

    def test_client_can_upload_receipt_for_own_student(self):
        response = self.client.post("/api/client/payments/upload-receipt/", {
            "student_id": self.student.id,
            "amount_minor": "24000",
            "currency": "PLN",
            "paid_at": date.today().isoformat(),
            "method": "transfer",
            "file": SimpleUploadedFile("receipt.pdf", PDF, content_type="application/pdf"),
        })
        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(pk=response.json()["payment"]["id"])
        self.assertEqual(payment.student, self.student)
        self.assertEqual(payment.status, PaymentStatus.PENDING)
        self.assertEqual(payment.method, "bank_transfer")
        self.assertEqual(payment.receipts.get().uploaded_by, self.parent)

    def test_client_top_up_request_cannot_choose_status_or_payment_method(self):
        Charge.objects.create(
            student=self.student,
            description="Membership",
            amount_minor=24000,
            currency="PLN",
            due_date=date.today(),
        )
        balance_before = student_balance(self.student).amount_minor

        response = self.client.post("/api/client/payments/top-up-requests/", {
            "student_id": self.student.id,
            "idempotency_key": "portal-topup-status-001",
            "amount_minor": "10000",
            "currency": "PLN",
            "status": "confirmed",
            "confirm": "true",
            "method": "cash",
            "file": SimpleUploadedFile("transfer.pdf", PDF, content_type="application/pdf"),
        })

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get(pk=response.json()["top_up_request"]["id"])
        self.assertEqual(payment.status, PaymentStatus.PENDING)
        self.assertEqual(payment.method, PaymentMethod.TRANSFER)
        self.assertEqual(payment.source, PaymentSource.CLIENT_TOP_UP)
        self.assertEqual(student_balance(self.student).amount_minor, balance_before)
        self.assertFalse(response.json()["top_up_request"]["affects_balance"])
        self.assertEqual(payment.events.get().event_type, PaymentEventType.REQUESTED)

    def test_client_top_up_request_rejects_non_positive_amount(self):
        response = self.client.post("/api/client/payments/top-up-requests/", {
            "student_id": self.student.id,
            "idempotency_key": "portal-topup-invalid-001",
            "amount_minor": "-100",
            "currency": "PLN",
            "file": SimpleUploadedFile("transfer.pdf", PDF, content_type="application/pdf"),
        })

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payment.objects.filter(student=self.student).exists())

    def test_only_admin_confirmation_credits_client_balance_and_is_in_history(self):
        Charge.objects.create(
            student=self.student,
            description="Membership",
            amount_minor=24000,
            currency="PLN",
            due_date=date.today(),
        )
        response = self.client.post("/api/client/payments/top-up-requests/", {
            "student_id": self.student.id,
            "idempotency_key": "portal-topup-confirm-001",
            "amount_minor": "10000",
            "currency": "PLN",
            "file": SimpleUploadedFile("transfer.pdf", PDF, content_type="application/pdf"),
        })
        payment_id = response.json()["top_up_request"]["id"]

        forbidden = self.client.post(f"/api/admin/payments/{payment_id}/confirm/")
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(student_balance(self.student).amount_minor, 24000)

        admin = f.make_admin(username="payment_approver")
        self.client.force_login(admin)
        confirmed = self.client.post(f"/api/admin/payments/{payment_id}/confirm/")
        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.json()["affects_balance"])
        self.assertEqual(student_balance(self.student).amount_minor, 14000)

        self.client.force_login(self.parent.user)
        history = self.client.get("/api/client/payments/").json()["payments"][0]
        self.assertEqual(history["status"], PaymentStatus.CONFIRMED)
        self.assertEqual(
            [event["type"] for event in history["events"]],
            [PaymentEventType.REQUESTED, PaymentEventType.CONFIRMED],
        )

    def test_uploaded_receipt_is_visible_and_downloadable_by_client_and_admin(self):
        response = self.client.post("/api/client/payments/upload-receipt/", {
            "student_id": self.student.id,
            "amount_minor": "24000",
            "currency": "PLN",
            "method": "bank_transfer",
            "file": SimpleUploadedFile("profile-document.pdf", PDF, content_type="application/pdf"),
        })
        self.assertEqual(response.status_code, 201)
        receipt_id = response.json()["receipt"]["id"]

        client_payments = self.client.get("/api/client/payments/").json()["payments"]
        self.assertEqual(client_payments[0]["receipt"]["original_name"], "profile-document.pdf")
        admin = f.make_admin(username="document_admin")
        client_download = self.client.get(f"/api/documents/{receipt_id}/download/")
        self.assertEqual(client_download.status_code, 200)

        # Closing a streaming response emits request_finished and closes the
        # PostgreSQL connection. Finish database-backed assertions first.
        self.client.force_login(admin)
        admin_payments = self.client.get("/api/admin/payments/").json()["payments"]
        self.assertEqual(admin_payments[0]["receipt"]["original_name"], "profile-document.pdf")
        admin_download = self.client.get(f"/api/documents/{receipt_id}/download/")
        self.assertEqual(admin_download.status_code, 200)
        self.assertEqual(b"".join(client_download.streaming_content), PDF)
        client_download.close()
        self.assertEqual(b"".join(admin_download.streaming_content), PDF)
        admin_download.close()

    def test_client_cannot_upload_receipt_for_other_account(self):
        response = self.client.post("/api/client/payments/upload-receipt/", {
            "student_id": self.other_student.id,
            "amount_minor": "24000",
            "currency": "PLN",
            "paid_at": date.today().isoformat(),
            "file": SimpleUploadedFile("receipt.pdf", PDF, content_type="application/pdf"),
        })
        self.assertEqual(response.status_code, 404)

    def test_client_upload_receipt_requires_file(self):
        response = self.client.post("/api/client/payments/upload-receipt/", {
            "student_id": self.student.id,
            "amount_minor": "24000",
            "currency": "PLN",
            "paid_at": date.today().isoformat(),
            "method": "bank_transfer",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())


class TrainerPortalApiRule(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer(username="coach_a")
        self.other_trainer = f.make_trainer(username="coach_b")
        self.group = f.make_group("Акулы")
        self.student = f.make_student(group=self.group)
        create_subscription(student=self.student, subscription_type=f.make_sub_type(),
                            start_date=date.today() - timedelta(days=1))
        now = timezone.now()
        self.session = create_session(
            trainer=self.trainer, group=self.group, start_at=now,
            end_at=now + timedelta(hours=1), location="A", max_participants=10)
        self.other_session = create_session(
            trainer=self.other_trainer, group=self.group, start_at=now + timedelta(hours=2),
            end_at=now + timedelta(hours=3), location="B", max_participants=10)
        self.client.force_login(self.trainer.user)

    def test_trainer_sees_only_own_sessions(self):
        response = self.client.get("/api/trainer/sessions/")
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.json()["sessions"]]
        self.assertIn(self.session.id, ids)
        self.assertNotIn(self.other_session.id, ids)

    def test_substitute_trainer_sees_session_and_can_mark_attendance(self):
        self.session.substitute_trainer = self.other_trainer
        self.session.save(update_fields=["substitute_trainer"])

        original_response = self.client.get("/api/trainer/sessions/")
        self.client.force_login(self.other_trainer.user)
        substitute_response = self.client.get("/api/trainer/sessions/")
        attendance = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )

        self.assertFalse(any(row["id"] == self.session.id for row in original_response.json()["sessions"]))
        self.assertTrue(any(row["id"] == self.session.id for row in substitute_response.json()["sessions"]))
        self.assertEqual(attendance.status_code, 200)
        self.assertEqual(attendance.json()["status"], AttendanceStatus.PRESENT)

    def test_trainer_groups_and_history_are_filtered_to_trainer(self):
        self.group.default_trainer = self.trainer
        self.group.save()
        past = create_session(
            trainer=self.trainer,
            group=self.group,
            start_at=timezone.now() - timedelta(days=2, hours=1),
            end_at=timezone.now() - timedelta(days=2),
            location="Past",
            max_participants=10,
        )

        groups = self.client.get("/api/trainer/groups/")
        history = self.client.get("/api/trainer/history/")

        self.assertEqual(groups.status_code, 200)
        self.assertEqual(history.status_code, 200)
        self.assertTrue(any(row["id"] == self.group.id for row in groups.json()["groups"]))
        self.assertTrue(any(row["id"] == past.id for row in history.json()["sessions"]))
        self.assertFalse(any(row["id"] == self.other_session.id for row in history.json()["sessions"]))

    def test_trainer_can_mark_own_group_attendance(self):
        response = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], AttendanceStatus.PRESENT)
        self.assertEqual(self.student.attendance.count(), 1)

    def test_trainer_cannot_mark_other_trainers_session(self):
        response = self.client.post(
            f"/api/trainer/sessions/{self.other_session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_trainer_mark_attendance_rejects_invalid_status(self):
        response = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": "wrong"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_trainer_cannot_mark_student_outside_session_roster(self):
        other_group = f.make_group("Other")
        other_student = f.make_student(group=other_group)
        response = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/",
            data=json.dumps({"student_id": other_student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["student_id"][0]["code"],
            "invalid_choice",
        )
        self.assertFalse(other_student.attendance.exists())


class AdminPortalApiRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.group = f.make_group("Касатки")
        self.student = f.make_student(group=self.group, first="Ада", last="Тестова")
        Charge.objects.create(student=self.student, description="Абонемент",
                              amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self.client.force_login(self.admin)

    def test_admin_can_search_clients(self):
        response = self.client.get("/api/admin/clients/", {"q": "Тестова"})
        self.assertEqual(response.status_code, 200)
        rows = response.json()["clients"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["full_name"], "Тестова Ада")

    def test_group_roster_counts_lists_and_can_remove_inactive_participant(self):
        inactive = f.make_student(
            group=self.group, first="Inactive", last="Reserved")
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])

        groups_response = self.client.get("/api/admin/groups/")
        roster_response = self.client.get(
            "/api/admin/clients/", {"group_id": self.group.id, "page_size": 200})
        removed = self.client.post(
            f"/api/admin/participants/{inactive.id}/",
            data=json.dumps({"participant": {"group_id": None}}),
            content_type="application/json",
        )

        group_row = next(
            row for row in groups_response.json()["groups"]
            if row["id"] == self.group.id)
        self.assertEqual(groups_response.status_code, 200)
        self.assertEqual(group_row["participants_count"], 2)
        self.assertEqual(
            {row["id"] for row in roster_response.json()["clients"]},
            {self.student.id, inactive.id},
        )
        self.assertEqual(removed.status_code, 200)
        inactive.refresh_from_db()
        self.assertIsNone(inactive.group_id)
        self.assertFalse(inactive.is_active)

        blocked_profile_edit = self.client.post(
            f"/api/admin/participants/{inactive.id}/",
            data=json.dumps({"participant": {"first_name": "Changed"}}),
            content_type="application/json",
        )
        self.assertEqual(blocked_profile_edit.status_code, 400)

    def test_admin_client_list_exposes_each_participants_confirmed_money_balance(self):
        overpaid = f.make_student(group=self.group, first="Over", last="Paid")
        family_sibling = f.make_student(
            parent=overpaid.parent,
            group=self.group,
            first="Family",
            last="Sibling",
        )
        zero = f.make_student(group=self.group, first="Zero", last="Balance")
        Payment.objects.create(
            student=overpaid,
            amount_minor=500,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.CONFIRMED,
        )
        Payment.objects.create(
            student=zero,
            amount_minor=900,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.PENDING,
        )

        response = self.client.get("/api/admin/clients/", {"page_size": 200})

        rows = {row["id"]: row for row in response.json()["clients"]}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rows[self.student.id]["balance_minor"], 24000)
        self.assertEqual(rows[overpaid.id]["balance_minor"], -500)
        self.assertEqual(rows[family_sibling.id]["balance_minor"], 0)
        self.assertEqual(rows[zero.id]["balance_minor"], 0)
        self.assertEqual(rows[overpaid.id]["currency"], "PLN")

    def test_admin_client_list_identifies_only_subscriptions_valid_today(self):
        subscription_type = f.make_sub_type(
            name="Current Pack",
            sessions=4,
            days=30,
        )
        current = self.student
        frozen = f.make_student(group=self.group, first="Frozen", last="Current")
        future = f.make_student(group=self.group, first="Future", last="Pack")
        grace = f.make_student(group=self.group, first="Grace", last="Pack")
        expired = f.make_student(group=self.group, first="Expired", last="Pack")
        cancelled = f.make_student(group=self.group, first="Cancelled", last="Pack")
        today = date.today()
        current_subscription = create_subscription(
            student=current,
            subscription_type=subscription_type,
            start_date=today,
            created_by=self.admin,
        )
        manual_adjust(
            subscription=current_subscription,
            delta=-2,
            created_by=self.admin,
            note="Two sessions used",
        )
        frozen_subscription = create_subscription(
            student=frozen,
            subscription_type=subscription_type,
            start_date=today - timedelta(days=40),
            created_by=self.admin,
        )
        frozen_subscription.status = SubscriptionStatus.FROZEN
        frozen_subscription.save(update_fields=["status"])
        freeze_subscription(
            subscription=frozen_subscription,
            start_date=today - timedelta(days=35),
            end_date=today - timedelta(days=21),
            created_by=self.admin,
        )
        create_subscription(
            student=future,
            subscription_type=subscription_type,
            start_date=today + timedelta(days=1),
            created_by=self.admin,
        )
        create_subscription(
            student=grace,
            subscription_type=subscription_type,
            start_date=today - timedelta(days=32),
            created_by=self.admin,
        )
        create_subscription(
            student=expired,
            subscription_type=subscription_type,
            start_date=today - timedelta(days=60),
            created_by=self.admin,
        )
        cancelled_subscription = create_subscription(
            student=cancelled,
            subscription_type=subscription_type,
            start_date=today,
            created_by=self.admin,
        )
        cancelled_subscription.status = SubscriptionStatus.CANCELLED
        cancelled_subscription.save(update_fields=["status"])

        response = self.client.get("/api/admin/clients/", {"page_size": 200})

        rows = {row["id"]: row for row in response.json()["clients"]}
        self.assertTrue(rows[current.id]["has_current_subscription"])
        self.assertEqual(rows[current.id]["current_subscription_remaining"], 2)
        self.assertEqual(rows[current.id]["current_subscription_total"], 4)
        self.assertTrue(rows[frozen.id]["has_current_subscription"])
        self.assertFalse(rows[future.id]["has_current_subscription"])
        self.assertTrue(rows[grace.id]["has_current_subscription"])
        self.assertFalse(rows[expired.id]["has_current_subscription"])
        self.assertFalse(rows[cancelled.id]["has_current_subscription"])

    def test_admin_client_list_activity_uses_recent_present_sessions_of_every_type(self):
        trainer = f.make_trainer(username="client_activity_coach")
        now = timezone.now()

        def attendance_row(student, start_at, session_type, status=AttendanceStatus.PRESENT):
            session = create_session(
                trainer=trainer,
                group=self.group if session_type == SessionType.GROUP else None,
                individual_student=student if session_type != SessionType.GROUP else None,
                session_type=session_type,
                start_at=start_at,
                duration_minutes=60,
                location=f"Activity {student.id}",
                max_participants=8,
            )
            set_attendance(
                session_id=session.id,
                student=student,
                status=status,
                actor=self.admin,
                apply_financial_effects=False,
            )
            return session

        group_student = self.student
        individual_student = f.make_student(group=self.group, first="Individual", last="Active")
        split_student = f.make_student(group=self.group, first="Split", last="Active")
        boundary_student = f.make_student(group=self.group, first="Boundary", last="Active")
        old_student = f.make_student(group=self.group, first="Old", last="Inactive")
        absent_student = f.make_student(group=self.group, first="Absent", last="Inactive")
        excused_student = f.make_student(group=self.group, first="Excused", last="Inactive")
        rescheduled_student = f.make_student(group=self.group, first="Rescheduled", last="Inactive")
        cancelled_student = f.make_student(group=self.group, first="Cancelled", last="Inactive")
        future_student = f.make_student(group=self.group, first="Future", last="Inactive")
        never_student = f.make_student(group=self.group, first="Never", last="Inactive")

        group_session = attendance_row(
            group_student, now - timedelta(days=59), SessionType.GROUP)
        attendance_row(
            individual_student, now - timedelta(days=2), SessionType.INDIVIDUAL)
        attendance_row(
            split_student, now - timedelta(days=3), SessionType.SPLIT)
        attendance_row(
            boundary_student,
            now - timedelta(days=60),
            SessionType.GROUP,
        )
        old_session = attendance_row(
            old_student, now - timedelta(days=61), SessionType.GROUP)
        attendance_row(
            absent_student,
            now - timedelta(days=4),
            SessionType.GROUP,
            status=AttendanceStatus.ABSENT,
        )
        attendance_row(
            excused_student,
            now - timedelta(days=6),
            SessionType.GROUP,
            status=AttendanceStatus.EXCUSED,
        )
        attendance_row(
            rescheduled_student,
            now - timedelta(days=7),
            SessionType.GROUP,
            status=AttendanceStatus.RESCHEDULED,
        )
        cancelled_session = attendance_row(
            cancelled_student, now - timedelta(days=5), SessionType.GROUP)
        cancelled_session.is_cancelled = True
        cancelled_session.save(update_fields=["is_cancelled"])
        attendance_row(future_student, now + timedelta(days=1), SessionType.GROUP)

        with patch("portal.admin_client_views.timezone.now", return_value=now):
            response = self.client.get("/api/admin/clients/", {"page_size": 200})

        rows = {row["id"]: row for row in response.json()["clients"]}
        for student in (group_student, individual_student, split_student, boundary_student):
            self.assertTrue(rows[student.id]["is_recently_active"])
            self.assertIsNotNone(rows[student.id]["last_present_at"])
        for student in (
            old_student,
            absent_student,
            excused_student,
            rescheduled_student,
            cancelled_student,
            future_student,
            never_student,
        ):
            self.assertFalse(rows[student.id]["is_recently_active"])
        self.assertEqual(
            rows[group_student.id]["last_present_at"],
            timezone.localtime(group_session.start_at).isoformat(),
        )
        self.assertEqual(
            rows[old_student.id]["last_present_at"],
            timezone.localtime(old_session.start_at).isoformat(),
        )

    def test_admin_client_list_enrichment_query_count_does_not_grow_per_participant(self):
        create_subscription(
            student=self.student,
            subscription_type=f.make_sub_type(name="Query Pack"),
            start_date=date.today(),
            created_by=self.admin,
        )
        with CaptureQueriesContext(connection) as baseline:
            first_response = self.client.get("/api/admin/clients/", {"page_size": 200})

        for index in range(20):
            f.make_student(
                group=self.group,
                first=f"Bulk{index}",
                last="Query",
            )
        with CaptureQueriesContext(connection) as expanded:
            expanded_response = self.client.get("/api/admin/clients/", {"page_size": 200})

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(expanded_response.status_code, 200)
        self.assertEqual(len(expanded), len(baseline))

    def test_admin_can_create_adult_client_account(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "client_type": "adult",
                "account": {
                    "username": "adult_api",
                    "first_name": "Anna",
                    "last_name": "Nowak",
                    "email": "anna@example.com",
                    "phone": "+48555111111",
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        account = ParentAccount.objects.get(pk=payload["account"]["id"])
        participant = Student.objects.get(parent=account)
        self.assertEqual(account.user.role, Role.PARENT)
        self.assertEqual(account.phone, "+48555111111")
        self.assertTrue(participant.is_account_holder)
        self.assertEqual(participant.full_name, "Nowak Anna")

    def test_admin_can_create_self_participant_client_with_phone_login_by_default(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "account": {
                    "first_name": "Piotr",
                    "last_name": "Telefon",
                    "phone": "+48 500-111-222",
                },
                "participant": {
                    "birth_date": "1990-04-12",
                    "group_id": self.group.id,
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        account = ParentAccount.objects.get(pk=response.json()["account"]["id"])
        participant = Student.objects.get(parent=account)
        self.assertEqual(account.user.username, "48500111222")
        self.assertEqual(participant.first_name, "Piotr")
        self.assertEqual(participant.last_name, "Telefon")
        self.assertTrue(participant.is_account_holder)

        account.user.set_password("Str0ngPass!123")
        account.user.save(update_fields=["password"])
        self.client.logout()
        login = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "login": "+48 500-111-222",
                "password": "Str0ngPass!123",
            }),
            content_type="application/json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["user"]["username"], "48500111222")

    def test_admin_client_login_priority_is_manual_then_email_then_phone(self):
        email_response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({"account": {
                "first_name": "Email",
                "last_name": "Priority",
                "email": "  EMAIL.Login@Example.COM ",
                "phone": "+48 501-222-333",
            }}),
            content_type="application/json",
        )
        manual_response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({"account": {
                "first_name": "Manual",
                "last_name": "Priority",
                "username": "chosen.login",
                "email": "manual@example.com",
                "phone": "+48 502-333-444",
            }}),
            content_type="application/json",
        )

        self.assertEqual(email_response.status_code, 201)
        self.assertEqual(email_response.json()["account"]["username"], "email.login@example.com")
        self.assertEqual(manual_response.status_code, 201)
        self.assertEqual(manual_response.json()["account"]["username"], "chosen.login")

    def test_contact_login_collision_returns_structured_field_errors_without_suffix(self):
        f.make_parent(username="collision@example.com")

        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({"account": {
                "first_name": "Collision",
                "last_name": "Client",
                "email": "COLLISION@example.com",
            }}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertEqual(payload["error"], "Проверьте отмеченные поля.")
        self.assertEqual(payload["errors"]["account.username"][0]["code"], "duplicate")
        self.assertIn("account.email", payload["errors"])
        self.assertEqual(payload["non_field_errors"], [])
        self.assertFalse(ParentAccount.objects.filter(email__iexact="collision@example.com").exists())

    def test_phone_collision_uses_normalized_digits_even_with_manual_login(self):
        f.make_parent(username="existing-phone-owner", phone="+48 500-111-222")

        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({"account": {
                "first_name": "Duplicate",
                "last_name": "Phone",
                "username": "different.manual.login",
                "phone": "48500111222",
            }}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(
            payload["errors"]["account.phone"][0]["code"],
            "duplicate",
        )
        self.assertFalse(
            ParentAccount.objects.filter(
                user__username="different.manual.login").exists())

    def test_admin_can_create_family_client_with_child_participant(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "client_type": "family",
                "is_adult": False,
                "account": {
                    "username": "family_api",
                    "first_name": "Marta",
                    "last_name": "Kowalska",
                    "email": "family@example.com",
                    "phone": "+48555222222",
                },
                "participant": {
                    "first_name": "Jan",
                    "last_name": "Kowalski",
                    "group_id": self.group.id,
                    "birth_date": "2016-05-10",
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(len(payload["participants"]), 1)
        participant = Student.objects.get(pk=payload["participants"][0]["id"])
        self.assertFalse(participant.is_account_holder)
        self.assertEqual(participant.group, self.group)
        self.assertEqual(participant.birth_date.isoformat(), "2016-05-10")

    def test_admin_client_creation_defaults_to_account_holder_despite_legacy_type(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "client_type": "family",
                "account": {
                    "first_name": "Owner",
                    "last_name": "Account",
                    "phone": "+48 503-444-555",
                },
                "participant": {
                    "first_name": "Ignored",
                    "last_name": "Child",
                    "birth_date": "1991-06-07",
                    "group_id": self.group.id,
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        participant = Student.objects.get(
            parent_id=response.json()["account"]["id"])
        self.assertTrue(participant.is_account_holder)
        self.assertEqual(participant.first_name, "Owner")
        self.assertEqual(participant.last_name, "Account")
        self.assertEqual(participant.birth_date.isoformat(), "1991-06-07")
        self.assertEqual(participant.group_id, self.group.id)

    def test_admin_can_update_client_account_and_participant(self):
        account = self.student.parent

        participant_response = self.client.patch(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({"participant": {
                "first_name": "Ada",
                "last_name": "Updated",
                "birth_date": "2015-04-03",
                "email": "participant-updated@example.com",
                "medical_info": "Asthma",
                "contraindications": "No cold water",
                "emergency_contact_name": "Emergency Person",
                "emergency_contact_phone": "+48123123123",
                "admin_comments": "VIP",
                "group_id": None,
                "is_active": False,
            }}),
            content_type="application/json",
        )
        account_response = self.client.patch(
            f"/api/admin/clients/{account.id}/",
            data=json.dumps({"account": {
                "username": "updated_client_api",
                "first_name": "Client",
                "last_name": "Account",
                "phone": "+48555999999",
                "email": "new@example.com",
                "telegram_chat_id": "12345",
            }}),
            content_type="application/json",
        )

        self.assertEqual(participant_response.status_code, 200)
        self.assertEqual(account_response.status_code, 200)
        account.refresh_from_db()
        account.user.refresh_from_db()
        self.student.refresh_from_db()
        self.assertEqual(account.user.username, "updated_client_api")
        self.assertEqual(account.user.first_name, "Client")
        self.assertEqual(account.user.last_name, "Account")
        self.assertTrue(account.user.is_active)
        self.assertEqual(account.phone, "+48555999999")
        self.assertEqual(account.email, "new@example.com")
        self.assertEqual(account.telegram_chat_id, "12345")
        self.assertEqual(self.student.full_name, "Updated Ada")
        self.assertEqual(self.student.birth_date.isoformat(), "2015-04-03")
        self.assertEqual(self.student.email, "participant-updated@example.com")
        self.assertEqual(self.student.medical_info, "Asthma")
        self.assertEqual(self.student.contraindications, "No cold water")
        self.assertEqual(self.student.emergency_contact_name, "Emergency Person")
        self.assertEqual(self.student.emergency_contact_phone, "+48123123123")
        self.assertEqual(self.student.admin_comments, "VIP")
        self.assertIsNone(self.student.group)
        self.assertFalse(self.student.is_active)
        self.assertEqual(account_response.json()["account"]["username"], "updated_client_api")
        self.assertTrue(account_response.json()["account"]["is_active"])
        self.assertEqual(participant_response.json()["medical_info"], "Asthma")
        self.assertEqual(participant_response.json()["admin_comments"], "VIP")

    def test_admin_can_change_existing_client_login_without_contact_overwrite(self):
        account = self.student.parent
        old_login = account.user.username

        contacts = self.client.patch(
            f"/api/admin/clients/{account.id}/",
            data=json.dumps({"account": {
                "email": "changed-contact@example.com",
                "phone": "+48 509-111-222",
            }}),
            content_type="application/json",
        )
        self.assertEqual(contacts.status_code, 200)
        self.assertEqual(contacts.json()["account"]["username"], old_login)

        changed = self.client.patch(
            f"/api/admin/clients/{account.id}/",
            data=json.dumps({"account": {"username": "new.client.login"}}),
            content_type="application/json",
        )
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["account"]["username"], "new.client.login")

        self.client.logout()
        old_response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "login": old_login,
                "password": "Str0ngPass!123",
            }),
            content_type="application/json",
        )
        new_response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "login": "new.client.login",
                "password": "Str0ngPass!123",
            }),
            content_type="application/json",
        )

        self.assertEqual(old_response.status_code, 400)
        self.assertEqual(new_response.status_code, 200)
        self.assertEqual(new_response.json()["user"]["username"], "new.client.login")

    def test_admin_can_soft_archive_client_and_participant(self):
        account = self.student.parent

        client_response = self.client.delete(f"/api/admin/clients/{account.id}/")
        account.refresh_from_db()
        account.user.refresh_from_db()
        self.student.refresh_from_db()

        self.assertEqual(client_response.status_code, 200)
        self.assertFalse(account.user.is_active)
        self.assertFalse(self.student.is_active)
        self.assertFalse(client_response.json()["account"]["is_active"])
        self.assertFalse(client_response.json()["participants"][0]["is_active"])

        account_update = self.client.post(
            f"/api/admin/clients/{account.id}/",
            data=json.dumps({"phone": "+48000000000"}),
            content_type="application/json",
        )
        archived_participant_update = self.client.post(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({"first_name": "Changed"}),
            content_type="application/json",
        )

        participant = f.make_student(parent=account, first="Second", last="Participant")
        active_participant_archived_account_update = self.client.post(
            f"/api/admin/participants/{participant.id}/",
            data=json.dumps({"first_name": "Blocked"}),
            content_type="application/json",
        )
        participant_response = self.client.delete(f"/api/admin/participants/{participant.id}/")
        participant.refresh_from_db()
        account.refresh_from_db()
        self.student.refresh_from_db()

        self.assertEqual(account_update.status_code, 409)
        self.assertEqual(archived_participant_update.status_code, 400)
        self.assertEqual(active_participant_archived_account_update.status_code, 400)
        self.assertNotEqual(account.phone, "+48000000000")
        self.assertNotEqual(self.student.first_name, "Changed")
        self.assertNotEqual(participant.first_name, "Blocked")
        self.assertEqual(participant_response.status_code, 200)
        self.assertFalse(participant.is_active)
        self.assertFalse(participant_response.json()["is_active"])

    def test_admin_can_restore_archived_client_and_participants(self):
        account = self.student.parent
        self.client.delete(f"/api/admin/clients/{account.id}/")

        response = self.client.post(f"/api/admin/clients/{account.id}/restore/")

        account.user.refresh_from_db()
        self.student.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(account.user.is_active)
        self.assertTrue(self.student.is_active)
        self.assertTrue(response.json()["account"]["is_active"])
        self.assertTrue(response.json()["participants"][0]["is_active"])
        self.assertTrue(AuditLogEntry.objects.filter(
            action="client_account.restored",
            entity_id=str(account.id),
        ).exists())

    def test_archived_account_is_excluded_except_from_reserved_group_roster(self):
        account = self.student.parent
        subscription_type = f.make_sub_type(
            name="Archived projection pack",
            sessions=4,
            days=30,
        )
        create_subscription(
            student=self.student,
            subscription_type=subscription_type,
            start_date=date.today(),
            created_by=self.admin,
        )
        frozen_student = f.make_student(
            parent=account,
            group=self.group,
            first="Frozen",
            last="Archived Projection",
        )
        frozen_subscription = create_subscription(
            student=frozen_student,
            subscription_type=f.make_sub_type(
                name="Archived frozen projection pack",
                sessions=4,
                days=30,
            ),
            start_date=date.today(),
            created_by=self.admin,
        )
        frozen_subscription.status = SubscriptionStatus.FROZEN
        frozen_subscription.save(update_fields=["status"])
        Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.PENDING,
        )
        Payment.objects.create(
            student=self.student,
            amount_minor=2000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        account.user.is_active = False
        account.user.save(update_fields=["is_active"])
        # Preserve an active participant to cover inconsistent legacy rows: the
        # account state remains authoritative for every working projection.
        self.student.is_active = True
        self.student.save(update_fields=["is_active"])

        reference = self.client.get("/api/admin/reference/")
        active_clients = self.client.get("/api/admin/clients/", {"active": "true"})
        archived_clients = self.client.get("/api/admin/clients/", {"active": "false"})
        debtor_rows = self.client.get("/api/admin/debtors/")
        dashboard = self.client.get("/api/admin/dashboard/")
        groups = self.client.get("/api/admin/groups/")
        income_history = self.client.get(
            "/api/admin/reports/income/",
            {
                "date_from": date.today().isoformat(),
                "date_to": date.today().isoformat(),
                "currency": "PLN",
            },
        )
        create_participant = self.client.post(
            f"/api/admin/clients/{account.id}/participants/",
            data=json.dumps({
                "participant": {"first_name": "Blocked", "last_name": "Child"},
            }),
            content_type="application/json",
        )

        self.assertEqual(reference.status_code, 200)
        self.assertNotIn(
            self.student.id,
            [row["id"] for row in reference.json()["participants"]],
        )
        self.assertNotIn(
            self.student.id,
            [row["id"] for row in active_clients.json()["clients"]],
        )
        self.assertEqual(active_clients.json()["pagination"]["total"], 0)
        self.assertIn(
            self.student.id,
            [row["id"] for row in archived_clients.json()["clients"]],
        )
        self.assertEqual(archived_clients.json()["pagination"]["total"], 2)
        self.assertEqual(debtor_rows.status_code, 200)
        self.assertNotIn(
            self.student.id,
            [row["student_id"] for row in debtor_rows.json()["debtors"]],
        )
        self.assertEqual(
            dashboard.json()["clients"]["active_participants"],
            Student.objects.filter(
                is_active=True, parent__user__is_active=True).count(),
        )
        self.assertEqual(
            dashboard.json()["clients"],
            {
                "accounts": 0,
                "participants": 0,
                "active_participants": 0,
                "adult_account_holders": 0,
            },
        )
        self.assertEqual(
            dashboard.json()["finance"],
            {
                "pending_payments": 0,
                "pending_payments_minor": 0,
                "confirmed_today_minor": 0,
                "overdue_charges": 0,
                "overdue_charges_minor": 0,
                "debtors": 0,
            },
        )
        self.assertEqual(dashboard.json()["subscriptions"]["active"], 0)
        self.assertEqual(dashboard.json()["subscriptions"]["frozen"], 0)
        # Archived members still reserve their places until an admin removes
        # them from the group explicitly.
        self.assertEqual(groups.json()["groups"][0]["participants_count"], 2)
        self.assertEqual(income_history.json()["total_minor"], 2000)
        self.assertEqual(create_participant.status_code, 400)

    def test_admin_settings_routes_replace_separate_configuration_panel(self):
        created = self.client.post(
            "/api/admin/settings/locations/",
            data=json.dumps({"code": "settings-pool", "name": "Settings Pool", "timezone": "Europe/Warsaw"}),
            content_type="application/json",
        )

        locations = self.client.get("/api/admin/settings/locations/")
        audit_log = self.client.get("/api/admin/system/audit/")
        imports = self.client.get("/api/admin/system/imports/")
        security = self.client.get("/api/admin/system/security/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(locations.status_code, 200)
        self.assertTrue(any(row["code"] == "settings-pool" for row in locations.json()["locations"]))
        self.assertEqual(audit_log.status_code, 200)
        self.assertIn("entries", audit_log.json())
        self.assertEqual(imports.status_code, 200)
        self.assertIn("batches", imports.json())
        self.assertEqual(security.status_code, 200)
        self.assertTrue(any(row["id"] == self.admin.id for row in security.json()["users"]))

    def test_archived_participant_is_read_only_for_new_operations(self):
        active_subscription = create_subscription(
            student=self.student,
            subscription_type=f.make_sub_type(name="Existing Archived Pack", sessions=4),
            start_date=date.today(),
            created_by=self.admin,
        )
        trainer = f.make_trainer(username="archived_participant_coach")
        existing_session = create_session(
            trainer=trainer,
            individual_student=self.student,
            start_at=timezone.now() + timedelta(days=2),
            end_at=timezone.now() + timedelta(days=2, hours=1),
            location="Lane Existing",
            max_participants=1,
        )
        editable_session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(days=3),
            end_at=timezone.now() + timedelta(days=3, hours=1),
            location="Lane Editable",
            max_participants=8,
        )
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        stype = f.make_sub_type(name="Archived Pack", sessions=4)
        renewal_type = f.make_sub_type(name="Archived Renewal Pack", sessions=6)

        subscription = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": stype.id, "start_date": "2026-06-01"}),
            content_type="application/json",
        )
        charge = self.client.post(
            f"/api/admin/participants/{self.student.id}/charges/",
            data=json.dumps({"description": "Archived charge", "amount_minor": 1000}),
            content_type="application/json",
        )
        payment = self.client.post(
            "/api/admin/payments/",
            data=json.dumps({
                "participant_id": self.student.id,
                "amount_minor": 1000,
                "paid_at": date.today().isoformat(),
                "method": "cash",
            }),
            content_type="application/json",
        )
        session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "individual_student_id": self.student.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-07T17:00:00+02:00",
                "end_at": "2026-06-07T18:00:00+02:00",
                "location": "Lane 1",
                "max_participants": 1,
            }),
            content_type="application/json",
        )
        session_edit = self.client.post(
            f"/api/admin/schedule/sessions/{editable_session.id}/",
            data=json.dumps({"individual_student_id": self.student.id}),
            content_type="application/json",
        )
        attendance_roster = self.client.get(f"/api/admin/schedule/sessions/{existing_session.id}/attendance/")
        attendance_mark = self.client.post(
            f"/api/admin/schedule/sessions/{existing_session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        subscription_detail = self.client.get(f"/api/admin/subscriptions/{active_subscription.id}/")
        subscription_status = self.client.post(
            f"/api/admin/subscriptions/{active_subscription.id}/",
            data=json.dumps({"status": "cancelled"}),
            content_type="application/json",
        )
        subscription_renew = self.client.post(
            f"/api/admin/subscriptions/{active_subscription.id}/renew/",
            data=json.dumps({"subscription_type_id": renewal_type.id, "start_date": "2026-06-01"}),
            content_type="application/json",
        )
        subscription_freeze = self.client.post(
            f"/api/admin/subscriptions/{active_subscription.id}/freeze/",
            data=json.dumps({"start_date": "2026-06-01", "end_date": "2026-06-03"}),
            content_type="application/json",
        )
        subscription_adjust = self.client.post(
            f"/api/admin/subscriptions/{active_subscription.id}/adjust/",
            data=json.dumps({"delta": 1, "note": "archived participant correction"}),
            content_type="application/json",
        )
        detail = self.client.get(f"/api/admin/participants/{self.student.id}/")

        self.assertEqual(subscription.status_code, 400)
        self.assertEqual(charge.status_code, 400)
        self.assertEqual(payment.status_code, 400)
        self.assertEqual(session.status_code, 400)
        self.assertEqual(session_edit.status_code, 400)
        self.assertEqual(attendance_roster.status_code, 200)
        self.assertFalse(any(row["id"] == self.student.id for row in attendance_roster.json()["students"]))
        self.assertEqual(attendance_mark.status_code, 400)
        self.assertEqual(
            attendance_mark.json()["errors"]["student_id"][0]["code"],
            "invalid_choice",
        )
        self.assertEqual(subscription_detail.status_code, 200)
        self.assertEqual(subscription_status.status_code, 400)
        self.assertEqual(subscription_renew.status_code, 400)
        self.assertEqual(subscription_freeze.status_code, 400)
        self.assertEqual(subscription_adjust.status_code, 400)
        self.assertEqual(detail.status_code, 200)
        self.assertFalse(detail.json()["is_active"])

    def test_admin_can_view_and_mark_session_attendance(self):
        trainer = f.make_trainer(username="admin_attendance_coach")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(hours=1),
            end_at=timezone.now() + timedelta(hours=2),
            location="Pool Admin",
            max_participants=8,
        )

        roster = self.client.get(f"/api/admin/schedule/sessions/{session.id}/attendance/")
        marked = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/attendance/",
            data=json.dumps({"student_id": self.student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )

        self.assertEqual(roster.status_code, 200)
        self.assertTrue(any(row["id"] == self.student.id for row in roster.json()["students"]))
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.json()["status"], AttendanceStatus.PRESENT)

    def test_admin_can_add_mark_and_remove_one_off_session_participant(self):
        trainer = f.make_trainer(username="admin_one_off_coach")
        other_group = f.make_group("One-off group")
        extra_student = f.make_student(group=other_group, first="Extra", last="Student")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(hours=3),
            end_at=timezone.now() + timedelta(hours=4),
            location="Pool Admin",
            max_participants=8,
        )

        added = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/participants/",
            data=json.dumps({"student_id": extra_student.id}),
            content_type="application/json",
        )
        marked = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/attendance/",
            data=json.dumps({"student_id": extra_student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        removed = self.client.delete(
            f"/api/admin/schedule/sessions/{session.id}/participants/{extra_student.id}/",
        )

        self.assertEqual(added.status_code, 201)
        extra_row = next(row for row in added.json()["students"] if row["id"] == extra_student.id)
        self.assertEqual(extra_row["session_participant"]["source"], "manual")
        self.assertTrue(extra_row["can_remove_from_session"])
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.json()["status"], AttendanceStatus.PRESENT)
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(any(row["id"] == extra_student.id for row in removed.json()["students"]))
        self.assertEqual(
            SessionParticipant.objects.get(session=session, student=extra_student).status,
            SessionParticipantStatus.CANCELLED,
        )

    def test_admin_client_detail_includes_operational_history(self):
        trainer = f.make_trainer(username="detail_coach")
        stype = f.make_sub_type(name="Detail Pack", sessions=4, days=30, price_minor=12000)
        subscription = create_subscription(
            student=self.student,
            subscription_type=stype,
            start_date=date.today(),
            created_by=self.admin,
        )
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=timezone.now() - timedelta(hours=2),
            end_at=timezone.now() - timedelta(hours=1),
            location="Pool Detail",
            max_participants=8,
        )
        set_attendance(
            session_id=session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
            actor=self.admin,
        )
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=12000,
            currency="PLN",
            paid_at=date.today(),
            method="cash",
            status=PaymentStatus.PENDING,
            created_by=self.admin,
        )
        consent = Consent.objects.create(parent=self.student.parent, type=ConsentType.EMAIL)
        consent.grant("v1")

        response = self.client.get(f"/api/admin/clients/{self.student.parent_id}/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["account"]["id"], self.student.parent_id)
        self.assertEqual(payload["participants"][0]["id"], self.student.id)
        self.assertTrue(any(row["id"] == subscription.id for row in payload["subscriptions"]))
        self.assertTrue(any(row["id"] == payment.id for row in payload["payments"]))
        self.assertTrue(any(row["session_id"] == session.id for row in payload["attendance"]))
        self.assertTrue(any(row["type"] == ConsentType.EMAIL for row in payload["consents"]))
        self.assertIn("balance_minor", payload["summary"])

    def test_admin_can_add_account_holder_participant_once(self):
        account = f.make_parent(username="client_without_participant", phone="+48555333333")

        response = self.client.post(
            f"/api/admin/clients/{account.id}/participants/",
            data=json.dumps({"participant": {"is_account_holder": True}}),
            content_type="application/json",
        )
        duplicate = self.client.post(
            f"/api/admin/clients/{account.id}/participants/",
            data=json.dumps({"participant": {"is_account_holder": True}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Student.objects.filter(parent=account, is_account_holder=True).count(), 1)
        self.assertEqual(duplicate.status_code, 201)
        self.assertEqual(Student.objects.filter(parent=account, is_account_holder=True).count(), 1)

    def test_admin_api_contract_is_protected_and_lists_key_routes(self):
        response = self.client.get("/api/admin/api-contract/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        routes = {(row["method"], row["path"]) for row in payload["endpoints"]}
        self.assertIn(("GET", "/api/admin/dashboard/"), routes)
        self.assertIn(("POST", "/api/admin/schedule/check-conflict/"), routes)
        self.assertIn(("POST", "/api/admin/schedule/sessions/<id>/waitlist/"), routes)
        self.assertIn(("POST", "/api/admin/schedule/waitlist/<id>/promote/"), routes)
        self.assertIn(("DELETE", "/api/admin/schedule/waitlist/<id>/"), routes)
        self.assertIn(("POST", "/api/admin/notifications/quiet-hours/"), routes)
        self.assertIn(("POST", "/api/admin/payroll/periods/"), routes)
        self.assertIn(("GET", "/api/admin/payroll/periods/"), routes)
        self.assertIn(("GET", "/api/admin/payroll/periods/<id>/"), routes)
        self.assertIn(("POST", "/api/admin/payroll/rules/"), routes)
        self.assertIn(("POST", "/api/admin/settings/languages/"), routes)
        self.assertIn(("POST", "/api/admin/settings/locations/"), routes)
        self.assertIn(("GET", "/api/admin/settings/session-types/"), routes)
        self.assertIn(("POST", "/api/admin/settings/session-types/split/restore/"), routes)
        self.assertIn(("POST", "/api/admin/settings/notification-template-translations/"), routes)
        self.assertIn(("GET", "/api/client/overview/"), routes)
        self.assertEqual(payload["openapi"], "3.1.0")
        location_path = payload["paths"]["/api/admin/settings/locations/{location_id}/"]
        self.assertIn("patch", location_path)
        self.assertNotIn("post", location_path)

        parent = f.make_parent(username="contract_client")
        self.client.force_login(parent.user)
        forbidden = self.client.get("/api/admin/api-contract/")
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_settings_detail_uses_patch_not_post(self):
        location = Location.objects.create(code="patch-pool", name="Before")
        url = f"/api/admin/settings/locations/{location.id}/"
        payload = json.dumps({"name": "After"})

        updated = self.client.patch(url, data=payload, content_type="application/json")
        rejected = self.client.post(url, data=payload, content_type="application/json")

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["name"], "After")
        self.assertEqual(rejected.status_code, 405)

    def test_admin_trainer_crud(self):
        response = self.client.post(
            "/api/admin/trainers/",
            data=json.dumps({
                "trainer": {
                    "username": "trainer_api",
                    "first_name": "Marek",
                    "last_name": "Coach",
                    "email": "coach@example.com",
                    "phone": "+48555444444",
                },
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        trainer_id = response.json()["id"]

        update = self.client.patch(
            f"/api/admin/trainers/{trainer_id}/",
            data=json.dumps({"trainer": {
                "username": "trainer_api_updated",
                "first_name": "Updated",
                "last_name": "Coach",
                "email": "coach-updated@example.com",
                "phone": "+48555555555",
                "is_active": False,
                "user_is_active": False,
            }}),
            content_type="application/json",
        )
        detail = self.client.get(f"/api/admin/trainers/{trainer_id}/")
        listing = self.client.get("/api/admin/trainers/", {"active": "false", "q": "trainer_api_updated"})

        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["username"], "trainer_api_updated")
        self.assertEqual(update.json()["first_name"], "Updated")
        self.assertEqual(update.json()["last_name"], "Coach")
        self.assertEqual(update.json()["email"], "coach-updated@example.com")
        self.assertEqual(update.json()["phone"], "+48555555555")
        self.assertFalse(update.json()["is_active"])
        self.assertFalse(update.json()["user_is_active"])
        self.assertEqual(detail.json()["username"], "trainer_api_updated")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["trainers"][0]["id"], trainer_id)

        archived = self.client.delete(f"/api/admin/trainers/{trainer_id}/")
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.json()["is_active"])
        self.assertFalse(archived.json()["user_is_active"])

        reactivated = self.client.patch(
            f"/api/admin/trainers/{trainer_id}/",
            data=json.dumps({"trainer": {"is_active": True}}),
            content_type="application/json",
        )
        self.assertEqual(reactivated.status_code, 200)
        self.assertTrue(reactivated.json()["is_active"])
        self.assertTrue(reactivated.json()["user_is_active"])

    def test_admin_reference_endpoint_for_forms(self):
        trainer = f.make_trainer(username="ref_coach")
        self.group.default_trainer = trainer
        self.group.save()
        stype = f.make_sub_type(name="Reference Pack", sessions=8)
        location = Location.objects.create(code="ref-pool", name="Reference Pool")
        SessionTypeConfig.objects.create(
            code=SessionType.SPLIT,
            label="Reference split",
            default_capacity=2,
        )

        response = self.client.get("/api/admin/reference/", {"q": "Тестова"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(row["id"] == trainer.id for row in payload["trainers"]))
        self.assertTrue(any(row["id"] == self.group.id for row in payload["groups"]))
        self.assertTrue(any(row["id"] == stype.id for row in payload["subscription_types"]))
        self.assertTrue(any(row["id"] == location.id for row in payload["locations"]))
        self.assertEqual(payload["participants"][0]["id"], self.student.id)
        self.assertIn("payment_methods", payload["choices"])
        payment_method_values = [row["value"] for row in payload["choices"]["payment_methods"]]
        self.assertIn("bank_transfer", payment_method_values)
        self.assertNotIn("transfer", payment_method_values)
        self.assertEqual(payload["choices"]["session_types"][0]["value"], SessionType.SPLIT)
        self.assertEqual(payload["choices"]["session_types"][0]["default_capacity"], 2)

    def test_admin_reference_search_matches_full_name_in_either_order(self):
        target = f.make_student(
            group=self.group,
            first="Remote",
            last="Participant",
        )

        for query in ("Remote Participant", "Participant Remote"):
            with self.subTest(query=query):
                response = self.client.get("/api/admin/reference/", {"q": query})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    [row["id"] for row in response.json()["participants"]],
                    [target.id],
                )

    def test_participant_group_contract_supports_three_groups_atomically(self):
        second = f.make_group("Касатки 2")
        third = f.make_group("Касатки 3")
        fourth = f.make_group("Касатки 4")

        initial = self.client.get(f"/api/admin/participants/{self.student.id}/")
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.json()["group_id"], self.group.id)
        self.assertEqual(initial.json()["group"]["id"], self.group.id)

        assigned = self.client.post(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({
                "participant": {
                    "group_ids": [self.group.id, second.id, third.id],
                },
            }),
            content_type="application/json",
        )
        self.assertEqual(assigned.status_code, 200, assigned.content)
        self.assertEqual(
            {row["id"] for row in assigned.json()["groups"]},
            {self.group.id, second.id, third.id},
        )
        self.assertIsNone(assigned.json()["group"])
        self.assertIsNone(assigned.json()["group_id"])

        before_rejected = set(self.student.groups.values_list("id", flat=True))
        rejected = self.client.post(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({
                "participant": {
                    "group_ids": [self.group.id, second.id, third.id, fourth.id],
                },
            }),
            content_type="application/json",
        )
        legacy_rejected = self.client.post(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({"participant": {"group_id": fourth.id}}),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(legacy_rejected.status_code, 400)
        self.assertEqual(
            set(self.student.groups.values_list("id", flat=True)),
            before_rejected,
        )

        removed_one = self.client.post(
            f"/api/admin/participants/{self.student.id}/",
            data=json.dumps({
                "participant": {"group_ids": [second.id, third.id]},
            }),
            content_type="application/json",
        )
        self.assertEqual(removed_one.status_code, 200)
        self.assertEqual(
            {row["id"] for row in removed_one.json()["groups"]},
            {second.id, third.id},
        )
        old_group_roster = self.client.get(
            "/api/admin/clients/", {"group_id": self.group.id, "page_size": 200})
        second_group_roster = self.client.get(
            "/api/admin/clients/", {"group_id": second.id, "page_size": 200})
        self.assertNotIn(
            self.student.id,
            {row["id"] for row in old_group_roster.json()["clients"]},
        )
        self.assertIn(
            self.student.id,
            {row["id"] for row in second_group_roster.json()["clients"]},
        )

    def test_remote_reference_search_filters_before_the_first_hundred_rows(self):
        Student.objects.bulk_create([
            Student(
                parent=self.student.parent,
                first_name=f"Filler{index:03d}",
                last_name="Pinned",
            )
            for index in range(120)
        ])
        target_parent = f.make_parent(
            username="remote_unicode_parent", phone="+48555987654")
        target = f.make_student(
            parent=target_parent,
            first="Кирилл",
            last="Żółw",
            email="unicode.remote@example.test",
        )

        for query in (
            "Кирилл", "Żółw", "Кирилл Żółw", "Żółw Кирилл",
            "+48555987654", "UNICODE.REMOTE@EXAMPLE.TEST",
        ):
            with self.subTest(query=query):
                response = self.client.get("/api/admin/reference/", {"q": query})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    [row["id"] for row in response.json()["participants"]],
                    [target.id],
                )

    def test_phone_is_optional_and_instagram_is_admin_only(self):
        created = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "is_adult": True,
                "account": {
                    "first_name": "",
                    "last_name": "Безтелефона",
                    "phone": "",
                    "email": "",
                    "username": "",
                    "instagram_username": " https://www.instagram.com/H2O_Client/ ",
                },
                "participant": {"is_account_holder": True},
            }),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        account = created.json()["account"]
        self.assertEqual(account["phone"], "")
        self.assertEqual(account["instagram_username"], "h2o_client")
        self.assertTrue(account["username"].startswith("безтелефона"))

        invalid = self.client.post(
            f"/api/admin/clients/{account['id']}/",
            data=json.dumps({"account": {"instagram_username": "bad profile!"}}),
            content_type="application/json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("account.instagram_username", invalid.json()["errors"])

        created_account = ParentAccount.objects.get(pk=account["id"])
        self.client.force_login(created_account.user)
        client_payload = self.client.get("/api/client/profile/").json()
        self.assertNotIn("instagram_username", client_payload["account"])
        self.assertNotIn("telegram_chat_id", client_payload["account"])

    def test_adult_client_rejects_an_empty_name(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "is_adult": True,
                "account": {"phone": "", "email": "", "username": ""},
                "participant": {"is_account_holder": True},
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("account.first_name", response.json()["errors"])
        self.assertIn("account.last_name", response.json()["errors"])

    def test_admin_dashboard_endpoint_exposes_metrics(self):
        trainer = f.make_trainer(username="dashboard_coach")
        session_start = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        create_session(
            trainer=trainer,
            group=self.group,
            start_at=session_start,
            end_at=session_start + timedelta(hours=1),
            location="Pool A",
            max_participants=8,
        )
        Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            method="cash",
            status=PaymentStatus.PENDING,
            created_by=self.admin,
        )

        response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreaterEqual(payload["clients"]["participants"], 1)
        self.assertGreaterEqual(payload["operations"]["active_trainers"], 1)
        self.assertGreaterEqual(payload["operations"]["sessions_today"], 1)
        self.assertGreaterEqual(payload["finance"]["pending_payments"], 1)
        self.assertGreaterEqual(payload["finance"]["debtors"], 1)

    def test_admin_group_crud(self):
        response = self.client.post(
            "/api/admin/groups/",
            data=json.dumps({"name": "Adults", "description": "Evening group", "default_capacity": 12}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        group_id = response.json()["id"]

        trainer = f.make_trainer(username="group_default_coach")
        update = self.client.patch(
            f"/api/admin/groups/{group_id}/",
            data=json.dumps({"group": {
                "name": "Adults A",
                "description": "Updated evening group",
                "default_trainer_id": trainer.id,
                "is_active": False,
            }}),
            content_type="application/json",
        )
        detail = self.client.get(f"/api/admin/groups/{group_id}/")
        listing = self.client.get("/api/admin/groups/", {"q": "Adults A"})
        archived = self.client.delete(f"/api/admin/groups/{group_id}/")

        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["name"], "Adults A")
        self.assertEqual(update.json()["description"], "Updated evening group")
        self.assertEqual(update.json()["default_trainer"]["id"], trainer.id)
        self.assertEqual(update.json()["default_capacity"], 12)
        self.assertFalse(update.json()["is_active"])
        self.assertEqual(detail.json()["default_trainer"]["id"], trainer.id)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["groups"][0]["name"], "Adults A")
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.json()["is_active"])

    def test_admin_group_capacity_accepts_null_or_positive_integer_only(self):
        created = self.client.post(
            "/api/admin/groups/",
            data=json.dumps({"name": "Capacity group", "default_capacity": 9}),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["default_capacity"], 9)
        group_id = created.json()["id"]

        cleared = self.client.patch(
            f"/api/admin/groups/{group_id}/",
            data=json.dumps({"group": {"default_capacity": None}}),
            content_type="application/json",
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["default_capacity"])

        for invalid in (0, -1, 1.5, "many"):
            with self.subTest(invalid=invalid):
                response = self.client.patch(
                    f"/api/admin/groups/{group_id}/",
                    data=json.dumps({"group": {"default_capacity": invalid}}),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("default_capacity", response.json()["errors"])

    def test_admin_group_color_accepts_approved_key_or_null_only(self):
        created = self.client.post(
            "/api/admin/groups/",
            data=json.dumps({"name": "Palette group", "color_key": "forest-01"}),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["color_key"], "forest-01")
        group_id = created.json()["id"]

        cleared = self.client.patch(
            f"/api/admin/groups/{group_id}/",
            data=json.dumps({"group": {"color_key": None}}),
            content_type="application/json",
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["color_key"])

        rejected = self.client.patch(
            f"/api/admin/groups/{group_id}/",
            data=json.dumps({"group": {"color_key": "#ff0000"}}),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("color_key", rejected.json()["errors"])

        group = self.group.__class__.objects.get(pk=group_id)
        group.color_key = "legacy-key"
        group.save(update_fields=["color_key"])
        self.assertIsNone(self.client.get(f"/api/admin/groups/{group_id}/").json()["color_key"])

    def test_admin_session_type_color_accepts_approved_key_or_null_only(self):
        session_type = SessionTypeConfig.objects.create(
            code=SessionType.GROUP,
            label="Group",
        )
        updated = self.client.patch(
            f"/api/admin/settings/session-types/{session_type.id}/",
            data=json.dumps({"color_key": "violet-01"}),
            content_type="application/json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["color_key"], "violet-01")

        cleared = self.client.patch(
            f"/api/admin/settings/session-types/{session_type.id}/",
            data=json.dumps({"session_type": {"color_key": None}}),
            content_type="application/json",
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["color_key"])

        rejected = self.client.patch(
            f"/api/admin/settings/session-types/{session_type.id}/",
            data=json.dumps({"color_key": "violet-99"}),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("color_key", rejected.json()["errors"])

        session_type.color_key = "legacy-key"
        session_type.save(update_fields=["color_key"])
        detail = self.client.get(f"/api/admin/settings/session-types/{session_type.id}/")
        self.assertIsNone(detail.json()["color_key"])

    def test_schedule_color_resolver_prefers_group_then_type_then_standard(self):
        trainer = f.make_trainer(username="palette_resolver_coach")
        self.group.color_key = "forest-01"
        self.group.save(update_fields=["color_key"])
        session_type = SessionTypeConfig.objects.create(
            code=SessionType.GROUP,
            label="Group",
            color_key="violet-01",
        )
        start = timezone.now() + timedelta(hours=1)
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=start,
            end_at=start + timedelta(hours=1),
            location="Palette pool",
            max_participants=10,
        )

        group_color = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        self.assertEqual(group_color.json()["presentation_color_key"], "forest-01")

        self.group.color_key = "obsolete-key"
        self.group.save(update_fields=["color_key"])
        unknown_group = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        self.assertEqual(unknown_group.json()["presentation_color_key"], "standard")

        self.group.color_key = None
        self.group.save(update_fields=["color_key"])
        type_color = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        self.assertEqual(type_color.json()["presentation_color_key"], "violet-01")

        session_type.color_key = "obsolete-key"
        session_type.save(update_fields=["color_key"])
        fallback = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        self.assertEqual(fallback.json()["presentation_color_key"], "standard")

    def test_role_schedule_payloads_share_presentation_key_without_admin_color_fields(self):
        trainer = f.make_trainer(username="palette_roles_coach")
        self.group.color_key = "coral-01"
        self.group.save(update_fields=["color_key"])
        start = timezone.now() + timedelta(hours=1)
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=start,
            end_at=start + timedelta(hours=1),
            location="Role pool",
            max_participants=10,
        )

        admin_row = self.client.get(f"/api/admin/schedule/sessions/{session.id}/").json()
        self.client.force_login(trainer.user)
        trainer_row = next(
            row for row in self.client.get("/api/trainer/sessions/").json()["sessions"]
            if row["id"] == session.id
        )
        self.client.force_login(self.student.parent.user)
        client_row = next(
            row for row in self.client.get(
                "/api/client/schedule/", {"student_id": self.student.id}
            ).json()["sessions"]
            if row["id"] == session.id
        )

        self.assertEqual(
            {admin_row["presentation_color_key"], trainer_row["presentation_color_key"], client_row["presentation_color_key"]},
            {"coral-01"},
        )
        self.assertNotIn("color_key", trainer_row)
        self.assertNotIn("color_key", client_row)
        self.assertIn("roster", admin_row)
        self.assertNotIn("roster", trainer_row)
        self.assertNotIn("roster", client_row)

    def test_schedule_list_loads_session_type_colors_once(self):
        trainer = f.make_trainer(username="palette_query_coach")
        SessionTypeConfig.objects.create(
            code=SessionType.GROUP,
            label="Group",
            color_key="sky-01",
        )
        start = timezone.now() + timedelta(hours=1)
        for offset in range(3):
            session_start = start + timedelta(hours=offset * 2)
            create_session(
                trainer=trainer,
                group=self.group,
                start_at=session_start,
                end_at=session_start + timedelta(hours=1),
                location=f"Palette pool {offset}",
                max_participants=10,
            )

        with CaptureQueriesContext(connection) as captured:
            response = self.client.get("/api/admin/schedule/sessions/", {"page_size": 200})

        color_queries = [
            query["sql"] for query in captured.captured_queries
            if "scheduling_sessiontypeconfig" in query["sql"].lower()
        ]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(color_queries), 1)

    def test_individual_and_split_sessions_use_their_type_colors_without_group(self):
        trainer = f.make_trainer(username="palette_individual_coach")
        SessionTypeConfig.objects.create(
            code=SessionType.INDIVIDUAL,
            label="Individual",
            color_key="gold-01",
        )
        SessionTypeConfig.objects.create(
            code=SessionType.SPLIT,
            label="Split",
            color_key="indigo-01",
        )
        start = timezone.now() + timedelta(hours=1)
        individual = create_session(
            trainer=trainer,
            individual_student=self.student,
            session_type=SessionType.INDIVIDUAL,
            start_at=start,
            end_at=start + timedelta(hours=1),
            location="Lane 1",
            max_participants=1,
        )
        split = create_session(
            trainer=trainer,
            individual_student=self.student,
            session_type=SessionType.SPLIT,
            start_at=start + timedelta(hours=2),
            end_at=start + timedelta(hours=3),
            location="Lane 2",
            max_participants=2,
        )

        individual_payload = self.client.get(
            f"/api/admin/schedule/sessions/{individual.id}/"
        ).json()
        split_payload = self.client.get(
            f"/api/admin/schedule/sessions/{split.id}/"
        ).json()
        self.assertEqual(individual_payload["presentation_color_key"], "gold-01")
        self.assertEqual(split_payload["presentation_color_key"], "indigo-01")

    def test_admin_subscription_type_crud(self):
        response = self.client.post(
            "/api/admin/subscription-types/",
            data=json.dumps({"subscription_type": {
                "name": "Pack 4",
                "price_minor": 12000,
                "currency": "PLN",
                "duration_days": 30,
                "sessions_count": 4,
                "is_individual": False,
            }}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        stype_id = response.json()["id"]

        update = self.client.patch(
            f"/api/admin/subscription-types/{stype_id}/",
            data=json.dumps({"subscription_type": {
                "name": "Pack 4 Updated",
                "price_minor": 13000,
                "currency": "PLN",
                "duration_days": 45,
                "sessions_count": "",
                "is_individual": True,
                "is_active": False,
            }}),
            content_type="application/json",
        )
        detail = self.client.get(f"/api/admin/subscription-types/{stype_id}/")
        archived = self.client.delete(f"/api/admin/subscription-types/{stype_id}/")
        invalid = self.client.patch(
            f"/api/admin/subscription-types/{stype_id}/",
            data=json.dumps({"subscription_type": {"price_minor": ""}}),
            content_type="application/json",
        )

        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["name"], "Pack 4 Updated")
        self.assertEqual(update.json()["price_minor"], 13000)
        self.assertEqual(update.json()["duration_days"], 45)
        self.assertTrue(update.json()["is_individual"])
        self.assertFalse(update.json()["is_active"])
        self.assertTrue(update.json()["is_unlimited"])
        self.assertEqual(detail.json()["name"], "Pack 4 Updated")
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.json()["is_active"])
        self.assertEqual(invalid.status_code, 400)

    def test_admin_can_create_subscription_with_charge(self):
        stype = f.make_sub_type(name="Pack API", sessions=4, days=30, price_minor=12000)

        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": stype.id,
                "start_date": date.today().isoformat(),
                "create_charge": True,
                "idempotency_key": "portal-api-create-subscription-001",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["subscription"]["remaining_sessions"], 4)
        self.assertEqual(response.json()["charge"]["amount_minor"], 12000)
        self.assertEqual(Charge.objects.filter(student=self.student, subscription_id=response.json()["subscription"]["id"]).count(), 1)

    def test_admin_can_freeze_adjust_and_renew_subscription(self):
        stype = f.make_sub_type(name="Pack Freeze", sessions=4, days=30, price_minor=12000)
        new_type = f.make_sub_type(name="Pack Renew", sessions=8, days=30, price_minor=22000)
        subscription = create_subscription(
            student=self.student,
            subscription_type=stype,
            start_date=date.today(),
            created_by=self.admin,
        )

        freeze = self.client.post(
            f"/api/admin/subscriptions/{subscription.id}/freeze/",
            data=json.dumps({
                "start_date": date.today().isoformat(),
                "end_date": (date.today() + timedelta(days=2)).isoformat(),
                "reason": "holiday",
            }),
            content_type="application/json",
        )
        adjust = self.client.post(
            f"/api/admin/subscriptions/{subscription.id}/adjust/",
            data=json.dumps({"delta": 1, "note": "manual correction"}),
            content_type="application/json",
        )
        renew = self.client.post(
            f"/api/admin/subscriptions/{subscription.id}/renew/",
            data=json.dumps({
                "subscription_type_id": new_type.id,
                "start_date": (date.today() + timedelta(days=30)).isoformat(),
                "create_charge": True,
                "idempotency_key": "portal-api-renew-subscription-001",
            }),
            content_type="application/json",
        )

        self.assertEqual(freeze.status_code, 201)
        self.assertEqual(freeze.json()["days"], 3)
        self.assertEqual(adjust.status_code, 201)
        self.assertEqual(adjust.json()["entry"]["delta"], 1)
        self.assertEqual(renew.status_code, 201)
        self.assertEqual(renew.json()["subscription"]["subscription_type_id"], new_type.id)
        self.assertEqual(renew.json()["charge"]["amount_minor"], 22000)

    def test_admin_can_create_charge_and_payment_workflow(self):
        charge = self.client.post(
            f"/api/admin/participants/{self.student.id}/charges/",
            data=json.dumps({
                "description": "Manual charge",
                "idempotency_key": "portal-admin-charge-001",
                "amount_minor": 5000,
                "currency": "PLN",
                "due_date": date.today().isoformat(),
            }),
            content_type="application/json",
        )
        payment = self.client.post(
            "/api/admin/payments/",
            data=json.dumps({
                "participant_id": self.student.id,
                "idempotency_key": "portal-admin-payment-001",
                "amount_minor": 5000,
                "currency": "PLN",
                "paid_at": date.today().isoformat(),
                "method": "cash",
            }),
            content_type="application/json",
        )

        self.assertEqual(charge.status_code, 201)
        self.assertEqual(payment.status_code, 201)
        self.assertEqual(payment.json()["status"], PaymentStatus.CONFIRMED)
        self.assertEqual(student_balance(self.student).amount_minor, 24000)

        pending = Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            method="cash",
            status=PaymentStatus.PENDING,
            created_by=self.admin,
        )
        rejected = self.client.post(
            f"/api/admin/payments/{pending.id}/reject/",
            data=json.dumps({"reason": "wrong amount"}),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["status"], PaymentStatus.REJECTED)

    def test_client_card_finance_rejects_a_participant_from_another_client(self):
        other_parent = f.make_parent()
        charge_count = Charge.objects.count()
        payment_count = Payment.objects.count()

        charge = self.client.post(
            f"/api/admin/participants/{self.student.id}/charges/",
            data=json.dumps({
                "client_id": other_parent.id,
                "description": "Wrong client charge",
                "amount_minor": 5000,
                "currency": "PLN",
                "due_date": date.today().isoformat(),
            }),
            content_type="application/json",
        )
        payment = self.client.post(
            "/api/admin/payments/",
            data=json.dumps({
                "client_id": other_parent.id,
                "participant_id": self.student.id,
                "idempotency_key": "wrong-client-payment-001",
                "amount_minor": 5000,
                "currency": "PLN",
                "paid_at": date.today().isoformat(),
                "method": "cash",
            }),
            content_type="application/json",
        )

        self.assertEqual(charge.status_code, 400)
        self.assertEqual(payment.status_code, 400)
        self.assertEqual(charge.json()["errors"]["client_id"][0]["code"], "mismatch")
        self.assertEqual(payment.json()["errors"]["client_id"][0]["code"], "mismatch")
        self.assertEqual(Charge.objects.count(), charge_count)
        self.assertEqual(Payment.objects.count(), payment_count)

    def test_schedule_template_routes_are_removed(self):
        self.assertEqual(self.client.get("/api/admin/schedule/templates/").status_code, 404)
        self.assertEqual(self.client.post("/api/admin/schedule/templates/1/generate/").status_code, 404)
        self.assertEqual(self.client.post("/api/admin/schedule/templates/1/cancel-future/").status_code, 404)

    def test_session_api_rejects_template_id_and_keeps_historical_session_readable(self):
        trainer = f.make_trainer(username="legacy_schedule_coach")
        template = f.make_template(self.group, trainer)
        session = create_session(
            trainer=trainer, group=self.group,
            start_at=timezone.now() + timedelta(days=5),
            duration_minutes=60, location="Legacy Pool", max_participants=8,
        )
        Session.objects.filter(pk=session.pk).update(template=template)

        historical = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        rejected = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "template_id": template.id,
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-01T17:00:00+02:00",
                "duration_minutes": 60,
                "location": "Pool",
                "max_participants": 8,
            }),
            content_type="application/json",
        )

        self.assertEqual(historical.status_code, 200)
        self.assertNotIn("template_id", historical.json())
        self.assertEqual(rejected.status_code, 400)

    def test_schedule_pagination_accepts_at_most_200(self):
        self.assertEqual(
            self.client.get("/api/admin/schedule/sessions/", {"page_size": 200}).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/admin/schedule/sessions/", {"page_size": 201}).status_code,
            400,
        )

    def test_admin_restores_cancelled_session_idempotently_and_audits_once(self):
        trainer = f.make_trainer(username="restore_schedule_coach")
        session = create_session(
            trainer=trainer, group=self.group,
            start_at=timezone.now() + timedelta(days=6),
            duration_minutes=60, location="Restore Pool", max_participants=8,
        )
        self.client.post(f"/api/admin/schedule/sessions/{session.id}/cancel/")

        first = self.client.post(f"/api/admin/schedule/sessions/{session.id}/restore/")
        second = self.client.post(f"/api/admin/schedule/sessions/{session.id}/restore/")

        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json()["restored"])
        self.assertFalse(first.json()["is_cancelled"])
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["restored"])
        self.assertEqual(AuditLogEntry.objects.filter(
            action="session.restored", entity_id=str(session.id),
        ).count(), 1)

    def test_restore_rechecks_conflict_and_requires_admin(self):
        trainer = f.make_trainer(username="restore_conflict_coach")
        start_at = timezone.now() + timedelta(days=7)
        cancelled = create_session(
            trainer=trainer, group=self.group, start_at=start_at,
            duration_minutes=60, location="Restore Pool", max_participants=8,
        )
        self.client.post(f"/api/admin/schedule/sessions/{cancelled.id}/cancel/")
        create_session(
            trainer=trainer, group=self.group, start_at=start_at + timedelta(minutes=15),
            duration_minutes=60, location="Other Pool", max_participants=8,
        )

        conflict = self.client.post(f"/api/admin/schedule/sessions/{cancelled.id}/restore/")
        self.client.force_login(self.student.parent.user)
        forbidden = self.client.post(f"/api/admin/schedule/sessions/{cancelled.id}/restore/")

        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(
            conflict.json()["errors"]["start_at"][0]["code"],
            "schedule_conflict",
        )
        self.assertIn(
            "Конфликт", conflict.json()["errors"]["start_at"][0]["message"])
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_attendance_payload_has_bulk_balance_statuses(self):
        trainer = f.make_trainer(username="balance_schedule_coach")
        zero = f.make_student(group=self.group, first="Zero", last="Balance")
        overpaid = f.make_student(group=self.group, first="Over", last="Paid")
        Payment.objects.create(
            student=overpaid, amount_minor=5000, currency="PLN",
            paid_at=date.today(), status=PaymentStatus.CONFIRMED,
        )
        session = create_session(
            trainer=trainer, group=self.group,
            start_at=timezone.now() + timedelta(days=8),
            duration_minutes=60, location="Balance Pool", max_participants=8,
        )

        response = self.client.get(f"/api/admin/schedule/sessions/{session.id}/attendance/")
        students = {row["id"]: row for row in response.json()["students"]}

        self.assertEqual(response.status_code, 200)
        self.assertEqual(students[self.student.id]["balance_minor"], 24000)
        self.assertEqual(students[zero.id]["balance_minor"], 0)
        self.assertEqual(students[overpaid.id]["balance_minor"], -5000)
        self.assertTrue(all(row["currency"] == "PLN" for row in students.values()))

    def test_admin_can_create_move_cancel_and_check_session_conflict(self):
        trainer = f.make_trainer(username="single_session_coach")
        self.group.price_minor = 4200
        self.group.currency = "EUR"
        self.group.save(update_fields=["price_minor", "currency"])
        session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-01T17:00:00+02:00",
                "end_at": "2026-06-01T18:00:00+02:00",
                "location": "Pool A",
                "max_participants": 8,
            }),
            content_type="application/json",
        )
        conflict = self.client.post(
            "/api/admin/schedule/check-conflict/",
            data=json.dumps({
                "trainer_id": trainer.id,
                "start_at": "2026-06-01T17:30:00+02:00",
                "end_at": "2026-06-01T18:30:00+02:00",
            }),
            content_type="application/json",
        )
        moved = self.client.post(
            f"/api/admin/schedule/sessions/{session.json()['id']}/",
            data=json.dumps({
                "start_at": "2026-06-01T19:00:00+02:00",
                "end_at": "2026-06-01T20:00:00+02:00",
                "notes": "moved by admin",
            }),
            content_type="application/json",
        )
        cancelled = self.client.post(f"/api/admin/schedule/sessions/{session.json()['id']}/cancel/")

        self.assertEqual(session.status_code, 201)
        self.assertEqual(session.json()["price_minor"], 4200)
        self.assertEqual(session.json()["currency"], "EUR")
        self.assertEqual(conflict.status_code, 200)
        self.assertTrue(conflict.json()["has_conflict"])
        self.assertEqual(moved.status_code, 200)
        self.assertTrue(moved.json()["is_manually_modified"])
        self.assertEqual(moved.json()["notes"], "moved by admin")
        self.assertEqual(moved.json()["price_minor"], 4200)
        self.assertEqual(moved.json()["currency"], "EUR")
        self.assertEqual(cancelled.status_code, 200)
        self.assertTrue(cancelled.json()["is_cancelled"])

    def test_admin_session_validation_returns_duration_and_choice_field_errors(self):
        trainer = f.make_trainer(username="duration_validation_coach")
        duration = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-05T17:00:00+02:00",
                "duration_minutes": 17,
                "location": "Pool A",
                "max_participants": 8,
            }),
            content_type="application/json",
        )
        missing_split_participant = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "trainer_id": trainer.id,
                "start_at": "2026-06-05T19:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane 2",
                "max_participants": 2,
            }),
            content_type="application/json",
        )
        fractional_capacity = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-05T20:00:00+02:00",
                "duration_minutes": 60,
                "location": "Pool A",
                "max_participants": 2.5,
            }),
            content_type="application/json",
        )
        fractional_price = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "individual",
                "individual_student_id": self.student.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-05T21:00:00+02:00",
                "duration_minutes": 60,
                "location": "Pool A",
                "max_participants": 1,
                "price_minor": 12.5,
            }),
            content_type="application/json",
        )
        missing_trainer = self.client.post(
            "/api/admin/schedule/check-conflict/",
            data=json.dumps({
                "trainer_id": 999999,
                "start_at": "2026-06-05T17:00:00+02:00",
                "duration_minutes": 60,
            }),
            content_type="application/json",
        )

        self.assertEqual(duration.status_code, 400)
        self.assertEqual(duration.json()["errors"]["duration_minutes"][0]["code"], "invalid_step")
        self.assertEqual(missing_trainer.status_code, 400)
        self.assertEqual(missing_trainer.json()["errors"]["trainer_id"][0]["code"], "invalid_choice")
        self.assertEqual(missing_split_participant.status_code, 400)
        self.assertEqual(
            missing_split_participant.json()["errors"]["individual_student_id"][0]["code"],
            "required",
        )
        self.assertEqual(fractional_capacity.status_code, 400)
        self.assertEqual(
            fractional_capacity.json()["errors"]["max_participants"][0]["code"],
            "invalid_integer",
        )
        self.assertEqual(fractional_price.status_code, 400)
        self.assertEqual(
            fractional_price.json()["errors"]["price_minor"][0]["code"],
            "invalid_integer",
        )

    def test_admin_can_create_individual_session(self):
        trainer = f.make_trainer(username="individual_session_coach")
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "individual_student_id": self.student.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-02T17:00:00+02:00",
                "end_at": "2026-06-02T18:00:00+02:00",
                "location": "Lane 1",
                "max_participants": 1,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["session_type"], "individual")
        self.assertEqual(response.json()["individual_student_id"], self.student.id)
        self.assertIsNone(response.json()["group"])
        self.student.refresh_from_db()
        self.assertEqual(self.student.group_id, self.group.id)

    def test_admin_can_override_individual_session_price_including_zero(self):
        trainer = f.make_trainer(username="individual_price_coach")
        SessionTypeConfig.objects.update_or_create(
            code=SessionType.INDIVIDUAL,
            defaults={
                "label": "Individual",
                "default_capacity": 1,
                "default_price_minor": 9000,
                "default_currency": "PLN",
                "default_duration_minutes": 60,
            },
        )
        common = {
            "session_type": "individual",
            "individual_student_id": self.student.id,
            "trainer_id": trainer.id,
            "duration_minutes": 60,
            "location": "Lane 1",
            "max_participants": 1,
        }
        default_price = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({**common, "start_at": "2026-06-04T17:00:00+02:00"}),
            content_type="application/json",
        )
        custom_price = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                **common,
                "start_at": "2026-06-04T19:00:00+02:00",
                "price_minor": 12500,
            }),
            content_type="application/json",
        )
        free = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                **common,
                "start_at": "2026-06-04T21:00:00+02:00",
                "price_minor": 0,
            }),
            content_type="application/json",
        )

        self.assertEqual(default_price.status_code, 201)
        self.assertEqual(custom_price.status_code, 201)
        self.assertEqual(free.status_code, 201)
        self.assertEqual(default_price.json()["price_minor"], 9000)
        self.assertEqual(custom_price.json()["price_minor"], 12500)
        self.assertEqual(free.json()["price_minor"], 0)

    def test_admin_can_create_split_session_for_two_clients(self):
        trainer = f.make_trainer(username="split_session_coach")
        second = f.make_student(first="Berta", last="Split")
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": self.student.id,
                "second_student_id": second.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-02T19:00:00+02:00",
                "end_at": "2026-06-02T20:00:00+02:00",
                "location": "Lane 2",
                "max_participants": 2,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["session_type"], "split")
        self.assertEqual(response.json()["individual_student_id"], self.student.id)
        self.assertEqual(response.json()["max_participants"], 2)
        self.assertEqual(
            [row["id"] for row in response.json()["roster"]],
            [self.student.id, second.id],
        )
        self.assertEqual(response.json()["participants_count"], 2)

        edited = self.client.post(
            f"/api/admin/schedule/sessions/{response.json()['id']}/",
            data=json.dumps({
                "individual_student_id": self.student.id,
                "location": "Lane 3",
            }),
            content_type="application/json",
        )

        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["session_type"], "split")
        self.assertEqual(edited.json()["location"], "Lane 3")
        self.assertEqual(
            [row["id"] for row in edited.json()["roster"]],
            [self.student.id, second.id],
        )

        duplicate_patch = self.client.patch(
            f"/api/admin/schedule/sessions/{response.json()['id']}/",
            data=json.dumps({"individual_student_id": second.id}),
            content_type="application/json",
        )
        unchanged = self.client.get(
            f"/api/admin/schedule/sessions/{response.json()['id']}/",
        )

        self.assertEqual(duplicate_patch.status_code, 400)
        self.assertEqual(
            duplicate_patch.json()["errors"]["individual_student_id"][0]["code"],
            "duplicate",
        )
        self.assertEqual(
            [row["id"] for row in unchanged.json()["roster"]],
            [self.student.id, second.id],
        )

        invalid_type_change = self.client.patch(
            f"/api/admin/schedule/sessions/{response.json()['id']}/",
            data=json.dumps({"session_type": SessionType.INDIVIDUAL}),
            content_type="application/json",
        )
        self.assertEqual(invalid_type_change.status_code, 400)
        self.assertEqual(
            invalid_type_change.json()["errors"]["session_type"][0]["code"],
            "roster_not_empty",
        )

    def test_admin_split_create_rejects_duplicate_second_student_atomically(self):
        trainer = f.make_trainer(username="split_atomic_coach")
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": self.student.id,
                "second_student_id": self.student.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-08T19:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane Atomic",
                "max_participants": 2,
            }),
            content_type="application/json",
        )
        listing = self.client.get(
            "/api/admin/schedule/sessions/",
            {"date_from": "2026-06-08", "date_to": "2026-06-08"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["second_student_id"][0]["code"],
            "duplicate",
        )
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["sessions"], [])

    def test_admin_split_second_student_must_be_active_and_fit_capacity(self):
        trainer = f.make_trainer(username="split_second_validation_coach")
        second = f.make_student(first="Second", last="Inactive")
        second.is_active = False
        second.save(update_fields=["is_active"])
        common = {
            "session_type": "split",
            "individual_student_id": self.student.id,
            "second_student_id": second.id,
            "trainer_id": trainer.id,
            "duration_minutes": 60,
            "location": "Lane Validation",
            "max_participants": 2,
        }
        inactive = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                **common,
                "start_at": "2026-06-11T17:00:00+02:00",
            }),
            content_type="application/json",
        )
        second.is_active = True
        second.save(update_fields=["is_active"])
        over_capacity = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                **common,
                "start_at": "2026-06-11T19:00:00+02:00",
                "max_participants": 1,
            }),
            content_type="application/json",
        )

        self.assertEqual(inactive.status_code, 400)
        self.assertIn("second_student_id", inactive.json()["errors"])
        self.assertEqual(over_capacity.status_code, 400)
        self.assertEqual(
            over_capacity.json()["errors"]["max_participants"][0]["code"],
            "capacity_below_roster",
        )

    def test_admin_can_replace_split_second_student_and_roster_freezes_after_attendance(self):
        trainer = f.make_trainer(username="split_roster_coach")
        second = f.make_student(first="Second", last="Original")
        replacement = f.make_student(first="Second", last="Replacement")
        extra = f.make_student(first="Third", last="Preserved")
        waiting = f.make_student(first="Fourth", last="Waiting")
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": self.student.id,
                "second_student_id": second.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-09T19:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane Roster",
                "max_participants": 4,
            }),
            content_type="application/json",
        )
        session_id = created.json()["id"]
        third = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/participants/",
            data=json.dumps({"student_id": extra.id}),
            content_type="application/json",
        )
        replaced = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"second_student_id": replacement.id}),
            content_type="application/json",
        )
        too_small = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"max_participants": 2}),
            content_type="application/json",
        )
        removed_before_attendance = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"second_student_id": None}),
            content_type="application/json",
        )
        readded_before_attendance = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"second_student_id": second.id}),
            content_type="application/json",
        )
        changed_base = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"individual_student_id": replacement.id}),
            content_type="application/json",
        )
        duplicate_manual_add = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/participants/",
            data=json.dumps({"student_id": replacement.id}),
            content_type="application/json",
        )
        waitlist = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/waitlist/",
            data=json.dumps({"student_id": waiting.id}),
            content_type="application/json",
        )
        attendance = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/attendance/",
            data=json.dumps({
                "student_id": replacement.id,
                "status": AttendanceStatus.PRESENT,
            }),
            content_type="application/json",
        )
        remove_second = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"second_student_id": None}),
            content_type="application/json",
        )
        add_after_attendance = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/participants/",
            data=json.dumps({"student_id": second.id}),
            content_type="application/json",
        )
        remove_after_attendance = self.client.delete(
            f"/api/admin/schedule/sessions/{session_id}/participants/{extra.id}/",
        )
        promote_after_attendance = self.client.post(
            f"/api/admin/schedule/waitlist/{waitlist.json()['id']}/promote/",
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(third.status_code, 201)
        self.assertEqual(replaced.status_code, 200)
        self.assertEqual(
            [row["id"] for row in replaced.json()["roster"]],
            [self.student.id, replacement.id, extra.id],
        )
        self.assertEqual(too_small.status_code, 400)
        self.assertEqual(
            too_small.json()["errors"]["max_participants"][0]["code"],
            "capacity_below_roster",
        )
        self.assertEqual(removed_before_attendance.status_code, 200)
        self.assertEqual(
            [row["id"] for row in removed_before_attendance.json()["roster"]],
            [self.student.id, extra.id],
        )
        self.assertEqual(readded_before_attendance.status_code, 200)
        self.assertEqual(
            [row["id"] for row in readded_before_attendance.json()["roster"]],
            [self.student.id, second.id, extra.id],
        )
        self.assertEqual(changed_base.status_code, 200)
        self.assertEqual(
            [row["id"] for row in changed_base.json()["roster"]],
            [replacement.id, second.id, extra.id],
        )
        self.assertEqual(duplicate_manual_add.status_code, 400)
        self.assertEqual(
            duplicate_manual_add.json()["errors"]["student_id"][0]["code"],
            "duplicate",
        )
        self.assertEqual(waitlist.status_code, 201)
        self.assertEqual(attendance.status_code, 200)
        for response in (
                remove_second, add_after_attendance,
                remove_after_attendance, promote_after_attendance):
            self.assertEqual(response.status_code, 400)
            self.assertIn("посещаем", str(response.json()).lower())
        detail = self.client.get(f"/api/admin/schedule/sessions/{session_id}/")
        self.assertEqual(
            [row["id"] for row in detail.json()["roster"]],
            [replacement.id, second.id, extra.id],
        )

    def test_split_one_off_price_uses_floor_of_active_roster_size(self):
        trainer = f.make_trainer(username="split_price_api_coach")
        solo = f.make_student(first="Solo", last="FullPrice")
        first = f.make_student(first="First", last="Thirds")
        second = f.make_student(first="Second", last="Thirds")
        third = f.make_student(first="Third", last="Thirds")

        solo_session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": solo.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-10T17:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane Price",
                "max_participants": 3,
                "price_minor": 10001,
            }),
            content_type="application/json",
        )
        thirds_session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": first.id,
                "second_student_id": second.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-10T19:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane Price",
                "max_participants": 3,
                "price_minor": 10001,
            }),
            content_type="application/json",
        )
        self.client.post(
            f"/api/admin/schedule/sessions/{thirds_session.json()['id']}/participants/",
            data=json.dumps({"student_id": third.id}),
            content_type="application/json",
        )
        for session_id, student in (
            (solo_session.json()["id"], solo),
            (thirds_session.json()["id"], first),
            (thirds_session.json()["id"], second),
            (thirds_session.json()["id"], third),
        ):
            marked = self.client.post(
                f"/api/admin/schedule/sessions/{session_id}/attendance/",
                data=json.dumps({
                    "student_id": student.id,
                    "status": AttendanceStatus.PRESENT,
                }),
                content_type="application/json",
            )
            self.assertEqual(marked.status_code, 200)

        solo_charges = self.client.get(
            f"/api/admin/participants/{solo.id}/charges/").json()["charges"]
        self.assertEqual([row["amount_minor"] for row in solo_charges], [10001])
        for student in (first, second, third):
            charges = self.client.get(
                f"/api/admin/participants/{student.id}/charges/").json()["charges"]
            self.assertEqual([row["amount_minor"] for row in charges], [3333])

    def test_attended_session_cannot_be_converted_to_split(self):
        trainer = f.make_trainer(username="split_convert_lock_coach")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=f.dt(2030, 6, 12, 17),
            duration_minutes=60,
            location="Lane Locked Convert",
            max_participants=4,
        )
        set_attendance(
            session_id=session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
            actor=self.admin,
        )
        replacement = f.make_student(first="Locked", last="Split")

        response = self.client.patch(
            f"/api/admin/schedule/sessions/{session.id}/",
            data=json.dumps({
                "session_type": "split",
                "group_id": None,
                "individual_student_id": replacement.id,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        session.refresh_from_db()
        self.assertEqual(session.session_type, SessionType.GROUP)
        self.assertEqual(session.group_id, self.group.id)

        empty_group = f.make_group("Split conversion capacity")
        extra_one = f.make_student(first="One", last="Conversion Extra")
        extra_two = f.make_student(first="Two", last="Conversion Extra")
        new_base = f.make_student(first="Base", last="Conversion")
        convertible = create_session(
            trainer=trainer,
            group=empty_group,
            start_at=f.dt(2030, 6, 12, 19),
            duration_minutes=60,
            location="Lane Capacity Convert",
            max_participants=2,
        )
        for extra in (extra_one, extra_two):
            added = self.client.post(
                f"/api/admin/schedule/sessions/{convertible.id}/participants/",
                data=json.dumps({"student_id": extra.id}),
                content_type="application/json",
            )
            self.assertIn(added.status_code, (200, 201))

        over_capacity = self.client.patch(
            f"/api/admin/schedule/sessions/{convertible.id}/",
            data=json.dumps({
                "session_type": "split",
                "group_id": None,
                "individual_student_id": new_base.id,
            }),
            content_type="application/json",
        )

        self.assertEqual(over_capacity.status_code, 400)
        self.assertEqual(
            over_capacity.json()["errors"]["max_participants"][0]["code"],
            "capacity_below_roster",
        )
        convertible.refresh_from_db()
        self.assertEqual(convertible.session_type, SessionType.GROUP)
        self.assertEqual(convertible.group_id, empty_group.id)

    def test_split_historical_roster_stays_visible_and_keeps_charge_share(self):
        trainer = f.make_trainer(username="split_historical_roster_coach")
        first = f.make_student(first="First", last="Historical")
        second = f.make_student(first="Second", last="Historical")
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": first.id,
                "second_student_id": second.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-13T17:00:00+02:00",
                "duration_minutes": 60,
                "location": "Lane Historical",
                "max_participants": 2,
                "price_minor": 10001,
            }),
            content_type="application/json",
        )
        session_id = created.json()["id"]
        second.parent.user.is_active = False
        second.parent.user.save(update_fields=["is_active"])
        outside = f.make_student(first="Outside", last="Historical")
        capacity_full = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/participants/",
            data=json.dumps({"student_id": outside.id}),
            content_type="application/json",
        )
        first_mark = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/attendance/",
            data=json.dumps({
                "student_id": first.id,
                "status": AttendanceStatus.PRESENT,
            }),
            content_type="application/json",
        )

        remark = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/attendance/",
            data=json.dumps({
                "student_id": first.id,
                "status": AttendanceStatus.EXCUSED,
            }),
            content_type="application/json",
        )
        restored = self.client.post(
            f"/api/admin/schedule/sessions/{session_id}/attendance/",
            data=json.dumps({
                "student_id": first.id,
                "status": AttendanceStatus.PRESENT,
            }),
            content_type="application/json",
        )
        detail = self.client.get(f"/api/admin/schedule/sessions/{session_id}/")
        attendance_detail = self.client.get(
            f"/api/admin/schedule/sessions/{session_id}/attendance/",
        )
        too_small = self.client.patch(
            f"/api/admin/schedule/sessions/{session_id}/",
            data=json.dumps({"max_participants": 1}),
            content_type="application/json",
        )
        charges = self.client.get(
            f"/api/admin/participants/{first.id}/charges/").json()["charges"]

        self.assertEqual(capacity_full.status_code, 400)
        self.assertEqual(first_mark.status_code, 200)
        self.assertEqual(remark.status_code, 200)
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(too_small.status_code, 400)
        self.assertEqual([row["amount_minor"] for row in charges], [5000, -5000, 5000])
        self.assertEqual(
            [row["id"] for row in detail.json()["roster"]],
            [first.id, second.id],
        )
        self.assertEqual(detail.json()["participants_count"], 2)
        self.assertEqual(
            [row["id"] for row in attendance_detail.json()["students"]],
            [first.id, second.id],
        )
        self.assertFalse(any(
            row["can_remove_from_session"]
            for row in attendance_detail.json()["students"]
        ))

    def test_admin_can_set_and_clear_session_substitute_trainer(self):
        trainer = f.make_trainer(username="scheduled_session_coach")
        substitute = f.make_trainer(username="substitute_session_coach")
        session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-03T17:00:00+02:00",
                "end_at": "2026-06-03T18:00:00+02:00",
                "location": "Pool A",
                "max_participants": 8,
            }),
            content_type="application/json",
        )
        substituted = self.client.post(
            f"/api/admin/schedule/sessions/{session.json()['id']}/",
            data=json.dumps({"substitute_trainer_id": substitute.id}),
            content_type="application/json",
        )
        cleared = self.client.post(
            f"/api/admin/schedule/sessions/{session.json()['id']}/",
            data=json.dumps({"substitute_trainer_id": None}),
            content_type="application/json",
        )

        self.assertEqual(session.status_code, 201)
        self.assertEqual(substituted.status_code, 200)
        self.assertEqual(substituted.json()["trainer_id"], trainer.id)
        self.assertEqual(substituted.json()["substitute_trainer_id"], substitute.id)
        self.assertEqual(substituted.json()["effective_trainer_id"], substitute.id)
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["substitute_trainer_id"])
        self.assertEqual(cleared.json()["effective_trainer_id"], trainer.id)

    def test_admin_can_manage_session_waitlist_without_deleting_history(self):
        trainer = f.make_trainer(username="waitlist_session_coach")
        waiting_student = f.make_student(first="Wait", last="Listed")
        cancelled_student = f.make_student(first="No", last="Longer")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=f.dt(2026, 6, 2, 19),
            end_at=f.dt(2026, 6, 2, 20),
            location="Pool A",
            max_participants=3,
        )

        created = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": waiting_student.id, "priority": 2, "note": "prefers 19:00"}),
            content_type="application/json",
        )
        duplicate = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": waiting_student.id}),
            content_type="application/json",
        )
        cancel_candidate = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": cancelled_student.id, "priority": 3}),
            content_type="application/json",
        )
        listing = self.client.get(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            {"status": WaitlistStatus.ACTIVE},
        )
        session_detail = self.client.get(f"/api/admin/schedule/sessions/{session.id}/")
        promoted = self.client.post(f"/api/admin/schedule/waitlist/{created.json()['id']}/promote/")
        attendance_roster = self.client.get(f"/api/admin/schedule/sessions/{session.id}/attendance/")
        attendance = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/attendance/",
            data=json.dumps({"student_id": waiting_student.id, "status": AttendanceStatus.PRESENT}),
            content_type="application/json",
        )
        repeat_promote = self.client.post(f"/api/admin/schedule/waitlist/{created.json()['id']}/promote/")
        cannot_cancel_promoted = self.client.delete(f"/api/admin/schedule/waitlist/{created.json()['id']}/")
        cancelled = self.client.delete(f"/api/admin/schedule/waitlist/{cancel_candidate.json()['id']}/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["student_id"], waiting_student.id)
        self.assertEqual(cancel_candidate.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["waitlist"]), 2)
        self.assertEqual(session_detail.json()["waitlist_active_count"], 2)
        self.assertEqual(promoted.status_code, 200)
        self.assertEqual(promoted.json()["status"], WaitlistStatus.PROMOTED)
        self.assertIsNotNone(promoted.json()["participant_id"])
        self.assertTrue(SessionParticipant.objects.filter(pk=promoted.json()["participant_id"]).exists())
        roster_ids = [row["id"] for row in attendance_roster.json()["students"]]
        self.assertIn(waiting_student.id, roster_ids)
        self.assertEqual(attendance.status_code, 200)
        self.assertEqual(repeat_promote.status_code, 400)
        self.assertEqual(cannot_cancel_promoted.status_code, 400)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["status"], WaitlistStatus.CANCELLED)
        entry = WaitlistEntry.objects.get(pk=created.json()["id"])
        cancelled_entry = WaitlistEntry.objects.get(pk=cancel_candidate.json()["id"])
        self.assertEqual(entry.status, WaitlistStatus.PROMOTED)
        self.assertEqual(cancelled_entry.status, WaitlistStatus.CANCELLED)
        self.assertTrue(AuditLogEntry.objects.filter(action="waitlist.created", entity_id=str(entry.id)).exists())
        self.assertTrue(AuditLogEntry.objects.filter(action="waitlist.updated", entity_id=str(cancelled_entry.id)).exists())
        self.assertTrue(AuditLogEntry.objects.filter(action="waitlist.promoted", entity_id=str(entry.id)).exists())

    def test_waitlist_promotion_full_session_keeps_entry_active(self):
        trainer = f.make_trainer(username="full_waitlist_coach")
        roster_student = f.make_student(first="Roster", last="Full", group=self.group)
        waiting_student = f.make_student(first="Still", last="Waiting")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=f.dt(2026, 6, 2, 20),
            end_at=f.dt(2026, 6, 2, 21),
            location="Pool A",
            max_participants=1,
        )
        set_attendance(
            session_id=session.id,
            student=roster_student,
            status=AttendanceStatus.PRESENT,
            actor=self.admin,
        )
        created = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": waiting_student.id, "priority": 1}),
            content_type="application/json",
        )
        promoted = self.client.post(f"/api/admin/schedule/waitlist/{created.json()['id']}/promote/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(promoted.status_code, 400)
        entry = WaitlistEntry.objects.get(pk=created.json()["id"])
        self.assertEqual(entry.status, WaitlistStatus.ACTIVE)
        self.assertFalse(SessionParticipant.objects.filter(session=session, student=waiting_student).exists())

    def test_archived_client_account_cannot_use_waitlist_operations(self):
        trainer = f.make_trainer(username="archived_waitlist_coach")
        archived_student = f.make_student(first="Archived", last="Waitlist")
        promote_blocked_student = f.make_student(first="Promote", last="Blocked")
        session = create_session(
            trainer=trainer,
            group=self.group,
            start_at=f.dt(2026, 6, 2, 21),
            end_at=f.dt(2026, 6, 2, 22),
            location="Pool B",
            max_participants=5,
        )

        archived_student.parent.user.is_active = False
        archived_student.parent.user.save(update_fields=["is_active"])
        create_blocked = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": archived_student.id}),
            content_type="application/json",
        )
        created_before_archive = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/waitlist/",
            data=json.dumps({"student_id": promote_blocked_student.id}),
            content_type="application/json",
        )
        promote_blocked_student.parent.user.is_active = False
        promote_blocked_student.parent.user.save(update_fields=["is_active"])
        promote_blocked = self.client.post(
            f"/api/admin/schedule/waitlist/{created_before_archive.json()['id']}/promote/")

        self.assertEqual(create_blocked.status_code, 400)
        self.assertEqual(created_before_archive.status_code, 201)
        self.assertEqual(promote_blocked.status_code, 400)
        self.assertFalse(SessionParticipant.objects.filter(
            session=session,
            student=promote_blocked_student,
            status=SessionParticipantStatus.ACTIVE,
        ).exists())

    def test_admin_cannot_double_book_trainer(self):
        trainer = f.make_trainer(username="blocked_session_coach")
        create_session(
            trainer=trainer,
            group=self.group,
            start_at=f.dt(2026, 6, 3, 17),
            end_at=f.dt(2026, 6, 3, 18),
            location="Pool A",
            max_participants=8,
        )

        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "start_at": "2026-06-03T17:30:00+02:00",
                "end_at": "2026-06-03T18:30:00+02:00",
                "location": "Pool B",
                "max_participants": 8,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_admin_rejects_invalid_payment_method(self):
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            method="cash",
            status=PaymentStatus.PENDING,
            created_by=self.admin,
        )

        response = self.client.post(
            f"/api/admin/payments/{payment.id}/",
            data=json.dumps({"method": "not-a-method"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payment.refresh_from_db()
        self.assertEqual(payment.method, "cash")

    def test_admin_payment_method_update_is_audited_with_before_after(self):
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            method="cash",
            status=PaymentStatus.PENDING,
            created_by=self.admin,
        )

        response = self.client.post(
            f"/api/admin/payments/{payment.id}/",
            data=json.dumps({
                "method": "bank_transfer",
                "amount_minor": 999999,
                "paid_at": "2025-01-01",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.method, "bank_transfer")
        self.assertEqual(payment.amount_minor, 1000)
        self.assertEqual(payment.paid_at, date.today())
        entry = AuditLogEntry.objects.get(action="payment.updated", entity_id=str(payment.id))
        self.assertEqual(entry.actor, self.admin)
        self.assertEqual(entry.changes["fields"], ["method"])
        self.assertEqual(entry.changes["changes"]["method"], {
            "from": "cash",
            "to": "bank_transfer",
        })

    def test_admin_income_report_requires_date_range(self):
        response = self.client.get("/api/admin/reports/income/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_admin_export_rejects_unknown_format(self):
        response = self.client.get("/api/admin/export/clients/pdf/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_admin_can_export_clients_csv_and_xlsx(self):
        csv_response = self.client.get("/api/admin/export/clients/csv/")
        xlsx_response = self.client.get("/api/admin/export/clients/xlsx/")

        self.assertEqual(csv_response.status_code, 200)
        self.assertEqual(csv_response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn('filename="clients.csv"', csv_response["Content-Disposition"])
        self.assertTrue(csv_response.content.startswith(b"\xef\xbb\xbf"))
        self.assertIn(self.student.last_name.encode("utf-8"), csv_response.content)

        self.assertEqual(xlsx_response.status_code, 200)
        self.assertEqual(
            xlsx_response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertIn('filename="clients.xlsx"', xlsx_response["Content-Disposition"])
        self.assertTrue(xlsx_response.content.startswith(b"PK"))

    def test_admin_import_endpoints_require_admin(self):
        anon_client = Client()
        response = anon_client.post("/api/admin/import/attendance/preview/")
        self.assertEqual(response.status_code, 403)

    def test_admin_import_clients_http_preview_commit_rollback(self):
        csv_bytes = "Фамилия;Имя;Email\r\nСоколов;Олег;oleg.http@example.com\r\n".encode("utf-8")
        mapping = {"Фамилия": "last_name", "Имя": "first_name", "Email": "email"}
        preview_response = self.client.post("/api/admin/import/clients/preview/", {
            "file": SimpleUploadedFile("clients.csv", csv_bytes, content_type="text/csv"),
            "mapping": json.dumps(mapping),
        })
        self.assertEqual(preview_response.status_code, 200)
        preview_rows = preview_response.json()["rows"]
        batch_id = preview_response.json()["batch_id"]
        self.assertEqual(len(preview_rows), 1)
        self.assertEqual(preview_rows[0]["status"], "new")

        commit_response = self.client.post(
            "/api/admin/import/clients/commit/",
            data=json.dumps({
                "batch_id": batch_id,
                "selected_indices": [row["index"] for row in preview_rows],
            }),
            content_type="application/json",
        )
        self.assertEqual(commit_response.status_code, 201)
        commit_payload = commit_response.json()
        self.assertEqual(commit_payload["rows_imported"], 1)
        self.assertTrue(Student.objects.filter(email="oleg.http@example.com").exists())

        rollback_preview = self.client.get(
            f"/api/admin/import/clients/{commit_payload['batch_id']}/rollback/")
        self.assertTrue(rollback_preview.json()["can_rollback"])
        rollback_response = self.client.post(
            f"/api/admin/import/clients/{commit_payload['batch_id']}/rollback/",
            data=json.dumps({
                "confirm_batch_id": commit_payload["batch_id"],
                "confirm_rollback": True,
            }),
            content_type="application/json")
        self.assertEqual(rollback_response.status_code, 200)
        self.assertFalse(Student.objects.filter(email="oleg.http@example.com").exists())

    def test_admin_import_clients_rejects_missing_file(self):
        response = self.client.post("/api/admin/import/clients/preview/", {
            "mapping": json.dumps({}),
        })
        self.assertEqual(response.status_code, 400)

    def test_admin_import_attendance_http_preview_and_commit(self):
        trainer = f.make_trainer(username="coach_http")
        group = f.make_group("Дельфины HTTP")
        f.make_student(group=group, first="Оля", last="Летняя", email="olya.http@example.com")
        csv_bytes = (
            "Дата;Клиент;Группа;Тренер;Статус;Окончание;Локация;Вместимость\r\n"
            "20.03.2026 09:00;olya.http@example.com;Дельфины HTTP;coach_http;"
            "present;10:00;Бассейн H;10\r\n"
        ).encode("utf-8")
        preview_response = self.client.post("/api/admin/import/attendance/preview/", {
            "file": SimpleUploadedFile("att.csv", csv_bytes, content_type="text/csv"),
        })
        self.assertEqual(preview_response.status_code, 200)
        rows = preview_response.json()["rows"]
        batch_id = preview_response.json()["batch_id"]
        self.assertEqual(rows[0]["status"], "will_create_session")

        commit_response = self.client.post(
            "/api/admin/import/attendance/commit/",
            data=json.dumps({
                "batch_id": batch_id,
                "selected_indices": [row["index"] for row in rows],
            }),
            content_type="application/json",
        )
        self.assertEqual(commit_response.status_code, 201)
        self.assertEqual(commit_response.json()["created_records"], 1)
        self.assertEqual(
            commit_response.json()["effect_mode"], ImportEffectMode.HISTORY_ONLY)
        batch = ImportBatch.objects.get(pk=batch_id)
        self.assertEqual(batch.effect_mode, ImportEffectMode.HISTORY_ONLY)
        self.assertFalse(Charge.objects.filter(
            attendance__session__group=group,
            attendance__student__email="olya.http@example.com",
        ).exists())
        self.assertTrue(AuditLogEntry.objects.filter(
            action="attendance.import_committed",
            entity_type="ImportBatch",
            entity_id=str(batch_id),
            changes__effect_mode=ImportEffectMode.HISTORY_ONLY,
        ).exists())

    def test_attendance_financial_import_requires_explicit_commit_confirmation(self):
        trainer = f.make_trainer(username="coach_financial_import")
        group = f.make_group("Финансовый импорт")
        group.price_minor = 7200
        group.save(update_fields=["price_minor"])
        student = f.make_student(
            group=group,
            first="Финансовый",
            last="Клиент",
            email="financial.import@example.com",
        )
        csv_bytes = (
            "Дата;Клиент;Группа;Тренер;Статус;Окончание;Локация;Вместимость\r\n"
            "21.03.2026 09:00;financial.import@example.com;Финансовый импорт;"
            "coach_financial_import;present;10:00;Бассейн Finance;10\r\n"
        ).encode("utf-8")
        preview = self.client.post("/api/admin/import/attendance/preview/", {
            "file": SimpleUploadedFile("att-financial.csv", csv_bytes, content_type="text/csv"),
            "effect_mode": ImportEffectMode.APPLY_FINANCIAL,
        }).json()
        commit_data = {
            "batch_id": preview["batch_id"],
            "selected_indices": [preview["rows"][0]["index"]],
        }

        missing_confirmation = self.client.post(
            "/api/admin/import/attendance/commit/",
            data=json.dumps(commit_data),
            content_type="application/json",
        )
        self.assertEqual(missing_confirmation.status_code, 400)
        self.assertEqual(
            missing_confirmation.json()["errors"]
            ["confirm_financial_effects"][0]["code"],
            "required",
        )
        self.assertEqual(
            ImportBatch.objects.get(pk=preview["batch_id"]).status,
            ImportBatchStatus.PREVIEWED,
        )
        self.assertFalse(Charge.objects.filter(student=student, attendance__isnull=False).exists())

        committed = self.client.post(
            "/api/admin/import/attendance/commit/",
            data=json.dumps({
                **commit_data,
                "confirm_financial_effects": True,
            }),
            content_type="application/json",
        )
        self.assertEqual(committed.status_code, 201)
        self.assertEqual(
            committed.json()["effect_mode"], ImportEffectMode.APPLY_FINANCIAL)
        self.assertTrue(committed.json()["financial_effects_applied"])
        charge = Charge.objects.get(student=student, attendance__isnull=False)
        self.assertEqual(charge.amount_minor, 7200)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="attendance.import_committed",
            entity_id=str(preview["batch_id"]),
            changes__financial_effects_applied=True,
        ).exists())

    def test_admin_import_payments_http_preview_and_commit(self):
        student = f.make_student(first="Стас", last="Быстров", email="stas.http@example.com")
        csv_bytes = (
            "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий\r\n"
            "stas.http@example.com;75;PLN;20.03.2026;cash;confirmed;\r\n"
        ).encode("utf-8")
        preview_response = self.client.post("/api/admin/import/payments/preview/", {
            "file": SimpleUploadedFile("pay.csv", csv_bytes, content_type="text/csv"),
        })
        self.assertEqual(preview_response.status_code, 200)
        rows = preview_response.json()["rows"]
        batch_id = preview_response.json()["batch_id"]
        self.assertEqual(rows[0]["status"], "new")

        commit_response = self.client.post(
            "/api/admin/import/payments/commit/",
            data=json.dumps({
                "batch_id": batch_id,
                "selected_indices": [row["index"] for row in rows],
            }),
            content_type="application/json",
        )
        self.assertEqual(commit_response.status_code, 201)
        self.assertEqual(commit_response.json()["created"], 1)
        self.assertTrue(Payment.objects.filter(student=student, amount_minor=7500).exists())

        batch = ImportBatch.objects.get(pk=batch_id)
        self.assertEqual(batch.status, ImportBatchStatus.COMMITTED)
        self.assertEqual(batch.input_data, {})

    def test_admin_import_commit_rejects_browser_supplied_rows(self):
        student = f.make_student(
            first="Secure", last="Import", email="secure.import@example.com")
        csv_bytes = (
            "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий\r\n"
            "secure.import@example.com;75;PLN;20.03.2026;cash;confirmed;\r\n"
        ).encode("utf-8")
        preview = self.client.post("/api/admin/import/payments/preview/", {
            "file": SimpleUploadedFile("pay.csv", csv_bytes, content_type="text/csv"),
        }).json()

        tampered = self.client.post(
            "/api/admin/import/payments/commit/",
            data=json.dumps({
                "batch_id": preview["batch_id"],
                "selected_indices": [preview["rows"][0]["index"]],
                "rows": [{
                    **preview["rows"][0],
                    "resolved": {
                        **preview["rows"][0]["resolved"],
                        "amount_minor": -999999,
                    },
                }],
            }),
            content_type="application/json",
        )

        self.assertEqual(tampered.status_code, 400)
        self.assertFalse(Payment.objects.filter(student=student).exists())
        self.assertEqual(
            ImportBatch.objects.get(pk=preview["batch_id"]).status,
            ImportBatchStatus.PREVIEWED,
        )

    def test_admin_import_batch_is_single_use_and_owner_bound(self):
        student = f.make_student(
            first="Owned", last="Import", email="owned.import@example.com")
        csv_bytes = (
            "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий\r\n"
            "owned.import@example.com;50;PLN;20.03.2026;cash;confirmed;\r\n"
        ).encode("utf-8")
        preview = self.client.post("/api/admin/import/payments/preview/", {
            "file": SimpleUploadedFile("pay.csv", csv_bytes, content_type="text/csv"),
        }).json()
        commit_data = json.dumps({
            "batch_id": preview["batch_id"],
            "selected_indices": [preview["rows"][0]["index"]],
        })

        other_client = Client()
        other_client.force_login(f.make_admin(username="other_import_admin"))
        wrong_owner = other_client.post(
            "/api/admin/import/payments/commit/",
            data=commit_data,
            content_type="application/json",
        )
        committed = self.client.post(
            "/api/admin/import/payments/commit/",
            data=commit_data,
            content_type="application/json",
        )
        repeated = self.client.post(
            "/api/admin/import/payments/commit/",
            data=commit_data,
            content_type="application/json",
        )

        self.assertEqual(wrong_owner.status_code, 400)
        self.assertEqual(committed.status_code, 201)
        self.assertEqual(repeated.status_code, 400)
        self.assertEqual(Payment.objects.filter(student=student).count(), 1)

    def test_admin_import_commit_revalidates_current_database_state(self):
        student = f.make_student(
            first="Current", last="State", email="current.state@example.com")
        csv_bytes = (
            "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий\r\n"
            "current.state@example.com;50;PLN;20.03.2026;cash;confirmed;\r\n"
        ).encode("utf-8")
        preview = self.client.post("/api/admin/import/payments/preview/", {
            "file": SimpleUploadedFile("pay.csv", csv_bytes, content_type="text/csv"),
        }).json()
        Payment.objects.create(
            student=student,
            amount_minor=5000,
            currency="PLN",
            paid_at=date(2026, 3, 20),
            method=PaymentMethod.CASH,
            status=PaymentStatus.CONFIRMED,
            source=PaymentSource.ADMIN,
            created_by=self.admin,
        )

        committed = self.client.post(
            "/api/admin/import/payments/commit/",
            data=json.dumps({
                "batch_id": preview["batch_id"],
                "selected_indices": [preview["rows"][0]["index"]],
            }),
            content_type="application/json",
        )

        self.assertEqual(committed.status_code, 201)
        self.assertEqual(committed.json()["created"], 0)
        self.assertEqual(committed.json()["skipped"], 1)
        self.assertEqual(Payment.objects.filter(student=student).count(), 1)

    def test_admin_import_commit_rejects_expired_batch(self):
        student = f.make_student(
            first="Expired", last="Batch", email="expired.batch@example.com")
        csv_bytes = (
            "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий\r\n"
            "expired.batch@example.com;50;PLN;20.03.2026;cash;confirmed;\r\n"
        ).encode("utf-8")
        preview = self.client.post("/api/admin/import/payments/preview/", {
            "file": SimpleUploadedFile("pay.csv", csv_bytes, content_type="text/csv"),
        }).json()
        ImportBatch.objects.filter(pk=preview["batch_id"]).update(
            preview_expires_at=timezone.now() - timedelta(seconds=1))

        committed = self.client.post(
            "/api/admin/import/payments/commit/",
            data=json.dumps({
                "batch_id": preview["batch_id"],
                "selected_indices": [preview["rows"][0]["index"]],
            }),
            content_type="application/json",
        )

        self.assertEqual(committed.status_code, 400)
        self.assertFalse(Payment.objects.filter(student=student).exists())

    def test_admin_mass_mail_requires_valid_channel_and_body(self):
        bad_channel = self.client.post(
            "/api/admin/notifications/mass-mail/",
            data=json.dumps({"channel": "paper-plane", "body": "hello"}),
            content_type="application/json",
        )
        unsupported_channel = self.client.post(
            "/api/admin/notifications/mass-mail/",
            data=json.dumps({"channel": "push", "body": "hello"}),
            content_type="application/json",
        )
        missing_body = self.client.post(
            "/api/admin/notifications/mass-mail/",
            data=json.dumps({"channel": Channel.EMAIL}),
            content_type="application/json",
        )

        self.assertEqual(bad_channel.status_code, 400)
        self.assertEqual(unsupported_channel.status_code, 400)
        self.assertEqual(missing_body.status_code, 400)

    def test_admin_notification_config_rejects_unsupported_push_channel(self):
        template = self.client.post(
            "/api/admin/notifications/templates/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": "push",
                "subject": "Payment",
                "body": "Pay now",
            }),
            content_type="application/json",
        )
        valid_template = NotificationTemplate.objects.create(
            event_type=EventType.PAYMENT_REMINDER,
            channel=Channel.EMAIL,
            subject="Payment",
            body="Pay now",
        )
        rule = self.client.post(
            "/api/admin/notifications/rules/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": "push",
                "template_id": valid_template.id,
                "offset_minutes": 0,
            }),
            content_type="application/json",
        )

        self.assertEqual(template.status_code, 400)
        self.assertEqual(rule.status_code, 400)

    def test_admin_debtors_endpoint_exposes_debt_reason(self):
        response = self.client.get("/api/admin/debtors/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["debtors"]
        self.assertEqual(len(rows), 1)
        self.assertIn("Просроченная оплата", rows[0]["reasons"])

    def test_client_cannot_use_admin_search(self):
        parent = f.make_parent()
        self.client.force_login(parent.user)
        response = self.client.get("/api/admin/clients/")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_queue_mass_mail_with_consent(self):
        consent = Consent.objects.create(parent=self.student.parent, type=ConsentType.EMAIL)
        consent.grant()
        response = self.client.post(
            "/api/admin/notifications/mass-mail/",
            data=json.dumps({
                "audience": "all",
                "channel": Channel.EMAIL,
                "subject": "Новость",
                "body": "Здравствуйте, {parent}",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["queued"], 1)
        log = NotificationLog.objects.get()
        self.assertEqual(log.event_type, "mass_mailing")
        self.assertEqual(log.payload["subject"], "Новость")

    def test_admin_can_manage_notification_templates_rules_and_logs(self):
        template_response = self.client.post(
            "/api/admin/notifications/templates/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": Channel.EMAIL,
                "subject": "Payment",
                "body": "{student}, pay {amount} before {date}",
            }),
            content_type="application/json",
        )
        self.assertEqual(template_response.status_code, 201)
        template_id = template_response.json()["id"]

        rule_response = self.client.post(
            "/api/admin/notifications/rules/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": Channel.EMAIL,
                "template_id": template_id,
                "offset_minutes": -1440,
            }),
            content_type="application/json",
        )
        self.assertEqual(rule_response.status_code, 201)
        rule_id = rule_response.json()["id"]

        updated_template = self.client.patch(
            f"/api/admin/notifications/templates/{template_id}/",
            data=json.dumps({"template": {"subject": "Updated payment"}}),
            content_type="application/json",
        )
        updated_rule = self.client.patch(
            f"/api/admin/notifications/rules/{rule_id}/",
            data=json.dumps({"rule": {"offset_minutes": 0}}),
            content_type="application/json",
        )
        rules = self.client.get("/api/admin/notifications/rules/", {"active": "true"})
        log = NotificationLog.objects.create(
            recipient=self.student.parent,
            event_type=EventType.PAYMENT_REMINDER,
            channel=Channel.EMAIL,
            status=DeliveryStatus.FAILED,
            subject="Failed",
            body="Body",
            error="Provider down",
        )
        logs = self.client.get("/api/admin/notifications/logs/", {"status": DeliveryStatus.FAILED})
        log_detail = self.client.get(f"/api/admin/notifications/logs/{log.id}/")
        protected_template_delete = self.client.delete(f"/api/admin/notifications/templates/{template_id}/")
        archived_rule = self.client.delete(f"/api/admin/notifications/rules/{rule_id}/")

        self.assertEqual(updated_template.status_code, 200)
        self.assertEqual(updated_template.json()["subject"], "Updated payment")
        self.assertEqual(updated_rule.status_code, 200)
        self.assertEqual(updated_rule.json()["offset_minutes"], 0)
        self.assertTrue(any(row["id"] == rule_id for row in rules.json()["rules"]))
        self.assertEqual(logs.status_code, 200)
        self.assertEqual(logs.json()["logs"][0]["id"], log.id)
        self.assertEqual(log_detail.json()["error"], "Provider down")
        self.assertEqual(protected_template_delete.status_code, 400)
        self.assertIn(
            "notification template is used",
            protected_template_delete.json()["non_field_errors"][0]["message"],
        )
        self.assertTrue(NotificationTemplate.objects.filter(pk=template_id).exists())
        self.assertFalse(archived_rule.json()["is_active"])

    def test_admin_can_manage_quiet_hours_policies(self):
        create = self.client.post(
            "/api/admin/notifications/quiet-hours/",
            data=json.dumps({
                "channel": Channel.EMAIL,
                "starts_at": "22:00",
                "ends_at": "08:00",
                "timezone": "Europe/Warsaw",
            }),
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 201)
        policy_id = create.json()["id"]

        update = self.client.patch(
            f"/api/admin/notifications/quiet-hours/{policy_id}/",
            data=json.dumps({"policy": {"starts_at": "21:30"}}),
            content_type="application/json",
        )
        listing = self.client.get("/api/admin/notifications/quiet-hours/", {"channel": Channel.EMAIL})
        archived = self.client.delete(f"/api/admin/notifications/quiet-hours/{policy_id}/")

        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["starts_at"], "21:30")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["policies"][0]["id"], policy_id)
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.json()["is_active"])
        self.assertEqual(QuietHoursPolicy.objects.get(pk=policy_id).starts_at.isoformat(timespec="minutes"), "21:30")

    def test_admin_can_anonymize_client_account(self):
        parent = self.student.parent
        parent.email = "family@example.com"
        parent.telegram_chat_id = "123"
        parent.instagram_username = "family_profile"
        parent.save()

        export = self.client.get(f"/api/admin/privacy/clients/{parent.id}/export/")
        self.assertEqual(export.status_code, 200)
        self.assertEqual(export["Content-Type"], "application/json; charset=utf-8")
        exported = json.loads(export.content.decode("utf-8"))
        self.assertEqual(exported["account"]["instagram_username"], "family_profile")

        response = self.client.post(f"/api/admin/privacy/clients/{parent.id}/anonymize/")
        self.assertEqual(response.status_code, 200)

        parent.refresh_from_db()
        self.student.refresh_from_db()
        parent.user.refresh_from_db()
        self.assertEqual(parent.phone, "")
        self.assertEqual(parent.email, "")
        self.assertEqual(parent.telegram_chat_id, "")
        self.assertEqual(parent.instagram_username, "")
        self.assertFalse(parent.user.is_active)
        self.assertFalse(self.student.is_active)
        self.assertEqual(self.student.email, "")
