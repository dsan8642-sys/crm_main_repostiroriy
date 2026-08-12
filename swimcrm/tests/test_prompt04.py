import json
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus
from notifications.models import Channel, DeliveryStatus, EventType, NotificationLog
from scheduling.models import SessionParticipant, SessionParticipantStatus
from scheduling.services import create_session

from . import factories as f


def _contains_key(value, forbidden):
    if isinstance(value, dict):
        return forbidden in value or any(_contains_key(item, forbidden) for item in value.values())
    if isinstance(value, list):
        return any(_contains_key(item, forbidden) for item in value)
    return False


class Prompt04ParticipantPrivacyRule(TestCase):
    def setUp(self):
        self.parent = f.make_parent(username="prompt04_parent")
        self.other_parent = f.make_parent(username="prompt04_other")
        self.trainer = f.make_trainer(username="prompt04_trainer")
        self.group_a = f.make_group("Prompt04 A")
        self.group_b = f.make_group("Prompt04 B")
        self.student_a = f.make_student(
            parent=self.parent, group=self.group_a, first="Anna", last="Scope")
        self.student_b = f.make_student(
            parent=self.parent, group=self.group_b, first="Bartosz", last="Scope")
        self.foreign_student = f.make_student(parent=self.other_parent, group=self.group_a)
        self.student_a.admin_comments = "staff-only participant note"
        self.student_a.save(update_fields=["admin_comments"])
        start = timezone.now() + timedelta(days=1)
        self.group_a_session = create_session(
            trainer=self.trainer, group=self.group_a, start_at=start,
            duration_minutes=60, location="A", max_participants=12,
            notes="staff-only session note")
        self.group_b_session = create_session(
            trainer=self.trainer, group=self.group_b, start_at=start + timedelta(hours=2),
            duration_minutes=60, location="B", max_participants=12)
        self.individual_a_session = create_session(
            trainer=self.trainer, individual_student=self.student_a,
            session_type="individual", start_at=start + timedelta(hours=4),
            duration_minutes=45, location="I", max_participants=1)
        self.manual_a_session = create_session(
            trainer=self.trainer, group=self.group_b, start_at=start + timedelta(hours=6),
            duration_minutes=60, location="M", max_participants=12)
        SessionParticipant.objects.create(
            session=self.manual_a_session,
            student=self.student_a,
            status=SessionParticipantStatus.ACTIVE,
        )
        self.cancelled_a_session = create_session(
            trainer=self.trainer, group=self.group_a, start_at=start + timedelta(hours=8),
            duration_minutes=60, location="C", max_participants=12)
        self.cancelled_a_session.is_cancelled = True
        self.cancelled_a_session.save(update_fields=["is_cancelled"])
        self.client.force_login(self.parent.user)

    def test_multi_participant_resources_require_owned_target_and_scope_records(self):
        for path in ("schedule", "attendance", "payments"):
            with self.subTest(path=path):
                missing = self.client.get(f"/api/client/{path}/")
                foreign = self.client.get(
                    f"/api/client/{path}/", {"student_id": self.foreign_student.id})
                self.assertEqual(missing.status_code, 400)
                self.assertEqual(foreign.status_code, 404)

        response = self.client.get(
            "/api/client/schedule/", {"student_id": self.student_a.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["student_id"], self.student_a.id)
        ids = {row["id"] for row in response.json()["sessions"]}
        self.assertIn(self.group_a_session.id, ids)
        self.assertIn(self.individual_a_session.id, ids)
        self.assertIn(self.manual_a_session.id, ids)
        self.assertIn(self.cancelled_a_session.id, ids)
        self.assertNotIn(self.group_b_session.id, ids)

    def test_client_and_trainer_payloads_exclude_staff_only_fields(self):
        profile = self.client.get("/api/client/profile/")
        schedule = self.client.get(
            "/api/client/schedule/", {"student_id": self.student_a.id})
        attempted_write = self.client.post(
            "/api/client/profile/",
            data=json.dumps({
                "participant": {
                    "id": self.student_a.id,
                    "first_name": "Updated",
                    "admin_comments": "client overwrite",
                },
                "account": {"telegram_chat_id": "raw-provider-id"},
            }),
            content_type="application/json",
        )
        self.student_a.refresh_from_db()
        self.parent.refresh_from_db()
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(schedule.status_code, 200)
        self.assertEqual(attempted_write.status_code, 200)
        for payload in (profile.json(), schedule.json(), attempted_write.json()):
            self.assertFalse(_contains_key(payload, "admin_comments"))
            self.assertFalse(_contains_key(payload, "notes"))
            self.assertFalse(_contains_key(payload, "telegram_chat_id"))
        self.assertEqual(self.student_a.admin_comments, "staff-only participant note")
        self.assertEqual(self.parent.telegram_chat_id, "")

        self.client.force_login(self.trainer.user)
        trainer_sessions = self.client.get("/api/trainer/sessions/")
        self.assertEqual(trainer_sessions.status_code, 200)
        self.assertFalse(_contains_key(trainer_sessions.json(), "notes"))
        self.assertFalse(_contains_key(trainer_sessions.json(), "admin_comments"))

    def test_client_notification_history_is_owned_and_provider_safe(self):
        own = NotificationLog.objects.create(
            recipient=self.parent,
            event_type=EventType.PAYMENT_REMINDER,
            channel=Channel.TELEGRAM,
            status=DeliveryStatus.FAILED,
            subject="Payment",
            body="Delivery body",
            provider_message_id="provider-secret",
            error="raw provider failure",
            payload={"chat_id": "raw-id"},
        )
        NotificationLog.objects.create(
            recipient=self.other_parent,
            event_type=EventType.PAYMENT_REMINDER,
            channel=Channel.EMAIL,
            status=DeliveryStatus.SENT,
            body="Other recipient",
        )
        response = self.client.get("/api/client/notifications/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["notifications"]
        self.assertEqual([row["id"] for row in rows], [own.id])
        for forbidden in ("provider_message_id", "error", "payload", "retries"):
            self.assertFalse(_contains_key(response.json(), forbidden))


class Prompt04BulkAttendanceRule(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer(username="prompt04_bulk_trainer")
        self.group = f.make_group("Prompt04 bulk")
        self.student_a = f.make_student(group=self.group, first="A", last="Bulk")
        self.student_b = f.make_student(group=self.group, first="B", last="Bulk")
        self.foreign = f.make_student(group=f.make_group("Prompt04 foreign"))
        self.session = create_session(
            trainer=self.trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(hours=1),
            duration_minutes=60,
            location="Pool",
            max_participants=12,
        )
        self.client.force_login(self.trainer.user)

    def test_bulk_attendance_is_atomic_and_authoritative(self):
        rejected = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/bulk/",
            data=json.dumps({"items": [
                {"student_id": self.student_a.id, "status": AttendanceStatus.PRESENT},
                {"student_id": self.foreign.id, "status": AttendanceStatus.ABSENT},
            ]}),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(
            rejected.json()["errors"]["items.1.student_id"][0]["code"],
            "invalid_choice",
        )
        self.assertFalse(AttendanceRecord.objects.filter(session=self.session).exists())

        accepted = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/bulk/",
            data=json.dumps({"items": [
                {"student_id": self.student_a.id, "status": AttendanceStatus.PRESENT},
                {"student_id": self.student_b.id, "status": AttendanceStatus.EXCUSED},
            ]}),
            content_type="application/json",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["updated_count"], 2)
        self.assertEqual(
            AttendanceRecord.objects.filter(session=self.session).count(), 2)

    def test_cancelled_bulk_attendance_is_read_only(self):
        self.session.is_cancelled = True
        self.session.save(update_fields=["is_cancelled"])
        response = self.client.post(
            f"/api/trainer/sessions/{self.session.id}/attendance/bulk/",
            data=json.dumps({"items": [
                {"student_id": self.student_a.id, "status": AttendanceStatus.PRESENT},
            ]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AttendanceRecord.objects.filter(session=self.session).exists())


class Prompt04AdminScheduleRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="prompt04_schedule_admin")
        self.active_trainer = f.make_trainer(username="prompt04_active_trainer")
        self.inactive_trainer = f.make_trainer(username="prompt04_inactive_trainer")
        self.inactive_trainer.is_active = False
        self.inactive_trainer.save(update_fields=["is_active"])
        self.group = f.make_group("Prompt04 schedule")
        self.client.force_login(self.admin)

    def _payload(self, trainer_id, **overrides):
        payload = {
            "trainer_id": trainer_id,
            "group_id": self.group.id,
            "session_type": "group",
            "start_at": (timezone.now() + timedelta(days=2)).isoformat(),
            "duration_minutes": 60,
            "location": "Pool",
            "max_participants": 12,
            "notes": "staff-only read-back",
        }
        payload.update(overrides)
        return payload

    def test_new_assignment_rejects_inactive_trainer_and_persists_staff_note(self):
        rejected = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload(self.inactive_trainer.id)),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(
            rejected.json()["errors"]["trainer_id"][0]["code"],
            "invalid_choice",
        )

        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload(self.active_trainer.id)),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["notes"], "staff-only read-back")
        detail = self.client.get(
            f"/api/admin/schedule/sessions/{created.json()['id']}/")
        self.assertEqual(detail.json()["notes"], "staff-only read-back")

    def test_historical_inactive_trainer_can_remain_on_an_edited_session(self):
        session = create_session(
            trainer=self.inactive_trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(days=3),
            duration_minutes=60,
            location="Old",
            max_participants=12,
        )
        response = self.client.patch(
            f"/api/admin/schedule/sessions/{session.id}/",
            data=json.dumps({
                "trainer_id": self.inactive_trainer.id,
                "location": "Historical read-only assignment",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["trainer_id"], self.inactive_trainer.id)

    def test_admin_bulk_attendance_rejects_entire_invalid_batch(self):
        student = f.make_student(group=self.group)
        foreign = f.make_student(group=f.make_group("Prompt04 admin foreign"))
        session = create_session(
            trainer=self.active_trainer,
            group=self.group,
            start_at=timezone.now() + timedelta(days=4),
            duration_minutes=60,
            location="Pool",
            max_participants=12,
        )
        response = self.client.post(
            f"/api/admin/schedule/sessions/{session.id}/attendance/bulk/",
            data=json.dumps({"items": [
                {"student_id": student.id, "status": AttendanceStatus.PRESENT},
                {"student_id": foreign.id, "status": AttendanceStatus.ABSENT},
            ]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["items.1.student_id"][0]["code"],
            "invalid_choice",
        )
        self.assertFalse(AttendanceRecord.objects.filter(session=session).exists())
