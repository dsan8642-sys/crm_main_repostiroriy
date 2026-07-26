import json
import tempfile
from datetime import date, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
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
from scheduling.models import (Location, SessionParticipant, SessionParticipantStatus,
                               SessionType, SessionTypeConfig, WaitlistEntry,
                               WaitlistStatus)
from scheduling.services import create_session
from students.models import Student
from subscriptions.services import create_subscription

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
        self.assertEqual(response.status_code, 403)
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

    def test_admin_can_create_family_client_with_child_participant(self):
        response = self.client.post(
            "/api/admin/clients/",
            data=json.dumps({
                "client_type": "family",
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
                "is_active": False,
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
        self.assertFalse(account.user.is_active)
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
        self.assertFalse(account_response.json()["account"]["is_active"])
        self.assertEqual(participant_response.json()["medical_info"], "Asthma")
        self.assertEqual(participant_response.json()["admin_comments"], "VIP")

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

        self.assertEqual(account_update.status_code, 400)
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
        self.assertEqual(attendance_mark.status_code, 403)
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
        self.assertIn(("POST", "/api/admin/settings/session-types/"), routes)
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
            data=json.dumps({"name": "Adults", "description": "Evening group"}),
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
        self.assertFalse(update.json()["is_active"])
        self.assertEqual(detail.json()["default_trainer"]["id"], trainer.id)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["groups"][0]["name"], "Adults A")
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.json()["is_active"])

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

    def test_admin_can_generate_and_cancel_schedule_from_template(self):
        trainer = f.make_trainer(username="schedule_coach")
        template = self.client.post(
            "/api/admin/schedule/templates/",
            data=json.dumps({
                "group_id": self.group.id,
                "trainer_id": trainer.id,
                "weekday": 0,
                "start_time": "17:00",
                "end_time": "18:00",
                "location": "Pool A",
                "max_participants": 8,
            }),
            content_type="application/json",
        )
        self.assertEqual(template.status_code, 201)

        generated = self.client.post(
            f"/api/admin/schedule/templates/{template.json()['id']}/generate/",
            data=json.dumps({"date_from": "2026-06-01", "date_to": "2026-06-30"}),
            content_type="application/json",
        )
        cancelled = self.client.post(
            f"/api/admin/schedule/templates/{template.json()['id']}/cancel-future/",
            data=json.dumps({"date_from": "2026-06-15"}),
            content_type="application/json",
        )

        self.assertEqual(generated.status_code, 201)
        self.assertEqual(generated.json()["created_count"], 5)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["cancelled"], 3)

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

    def test_admin_can_create_split_session_for_two_clients(self):
        trainer = f.make_trainer(username="split_session_coach")
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "split",
                "individual_student_id": self.student.id,
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
        self.assertIn("notification template is used", protected_template_delete.json()["error"][0])
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
        parent.save()

        export = self.client.get(f"/api/admin/privacy/clients/{parent.id}/export/")
        self.assertEqual(export.status_code, 200)
        self.assertEqual(export["Content-Type"], "application/json; charset=utf-8")
        self.assertIn("account", json.loads(export.content.decode("utf-8")))

        response = self.client.post(f"/api/admin/privacy/clients/{parent.id}/anonymize/")
        self.assertEqual(response.status_code, 200)

        parent.refresh_from_db()
        self.student.refresh_from_db()
        parent.user.refresh_from_db()
        self.assertEqual(parent.phone, "")
        self.assertEqual(parent.email, "")
        self.assertFalse(parent.user.is_active)
        self.assertFalse(self.student.is_active)
        self.assertEqual(self.student.email, "")
