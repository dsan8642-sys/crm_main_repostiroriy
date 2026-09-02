import json
from datetime import datetime, time, timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import AccountActivation
from audit.models import AuditLogEntry
from scheduling.models import Session, SessionType

from . import factories as f


class GroupTrainerArchiveLifecycleApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("archive_lifecycle_admin")
        self.trainer = f.make_trainer("archive_lifecycle_trainer")
        self.group = f.make_group("Archive lifecycle group")
        self.group.default_trainer = self.trainer
        self.group.save(update_fields=["default_trainer"])
        self.student = f.make_student(group=self.group, first="Archive", last="Member")
        tomorrow = timezone.localdate() + timedelta(days=1)
        start = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))
        self.session = Session.objects.create(
            session_type=SessionType.GROUP,
            group=self.group,
            trainer=self.trainer,
            start_at=start,
            end_at=start + timedelta(minutes=60),
            duration_minutes=60,
            location="Pool",
            max_participants=10,
        )
        AccountActivation.objects.create(
            user=self.trainer.user,
            token_hash="archive-lifecycle-token",
            expires_at=timezone.now() + timedelta(days=1),
            created_by=self.admin,
        )
        self.client.force_login(self.admin)

    def test_trainer_archive_is_idempotent_and_restore_preserves_sessions(self):
        first = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
        second = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["future_sessions_count"], 1)
        self.assertEqual(first.json()["cleared_default_groups_count"], 1)
        self.assertTrue(first.json()["changed"])
        self.assertFalse(second.json()["changed"])
        self.assertEqual(
            AuditLogEntry.objects.filter(action="trainer.archived").count(), 1)
        self.group.refresh_from_db()
        self.session.refresh_from_db()
        self.assertIsNone(self.group.default_trainer_id)
        self.assertFalse(self.session.is_cancelled)
        self.assertFalse(
            AccountActivation.objects.get(token_hash="archive-lifecycle-token").is_valid)

        restored = self.client.post(
            f"/api/admin/trainers/{self.trainer.id}/restore/", data={})
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.json()["changed"])
        self.trainer.refresh_from_db()
        self.trainer.user.refresh_from_db()
        self.assertTrue(self.trainer.is_active)
        self.assertTrue(self.trainer.user.is_active)
        self.assertIsNone(self.group.default_trainer_id)

    def test_group_archive_preserves_membership_and_can_be_restored(self):
        first = self.client.delete(f"/api/admin/groups/{self.group.id}/")
        second = self.client.delete(f"/api/admin/groups/{self.group.id}/")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["future_sessions_count"], 1)
        self.assertEqual(first.json()["preserved_participants_count"], 1)
        self.assertTrue(first.json()["changed"])
        self.assertFalse(second.json()["changed"])
        self.assertEqual(
            AuditLogEntry.objects.filter(action="group.archived").count(), 1)
        self.assertTrue(self.student.groups.filter(pk=self.group.id).exists())
        self.session.refresh_from_db()
        self.assertFalse(self.session.is_cancelled)

        restored = self.client.post(
            f"/api/admin/groups/{self.group.id}/restore/", data={})
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.json()["changed"])
        self.group.refresh_from_db()
        self.assertTrue(self.group.is_active)

    def test_archived_entities_cannot_receive_new_assignments(self):
        self.client.delete(f"/api/admin/groups/{self.group.id}/")
        other = f.make_student(first="New", last="Member")
        membership = self.client.post(
            f"/api/admin/participants/{other.id}/",
            data=json.dumps({"participant": {"group_ids": [self.group.id]}}),
            content_type="application/json",
        )
        group_session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "group", "group_id": self.group.id,
                "trainer_id": self.trainer.id,
                "start_at": (timezone.now() + timedelta(days=2)).isoformat(),
                "duration_minutes": 60, "location": "Pool", "max_participants": 10,
            }),
            content_type="application/json",
        )
        self.assertEqual(membership.status_code, 400)
        self.assertEqual(group_session.status_code, 400)

        self.client.post(f"/api/admin/groups/{self.group.id}/restore/", data={})
        self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
        trainer_session = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "group", "group_id": self.group.id,
                "trainer_id": self.trainer.id,
                "start_at": (timezone.now() + timedelta(days=3)).isoformat(),
                "duration_minutes": 60, "location": "Pool", "max_participants": 10,
            }),
            content_type="application/json",
        )
        self.assertEqual(trainer_session.status_code, 400)
