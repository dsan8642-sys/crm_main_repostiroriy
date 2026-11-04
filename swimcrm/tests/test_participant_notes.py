import json
from io import BytesIO
from datetime import date, timedelta
from importlib import import_module
from zipfile import ZipFile

from django.apps import apps
from django.test import TestCase
from django.utils import timezone

from accounts.privacy import anonymize_parent_account
from audit.models import AuditLogEntry
from scheduling.services import create_session
from students.models import ParticipantNote

from . import factories as f


class ParticipantNotesApiTests(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="notes_admin")
        self.trainer = f.make_trainer(username="notes_trainer")
        self.other_trainer = f.make_trainer(username="notes_other_trainer")
        self.group = f.make_group("Notes group")
        self.student = f.make_student(group=self.group)
        self.student.birth_date = date(2015, 5, 10)
        self.student.save(update_fields=["birth_date"])
        self.outsider = f.make_student(group=f.make_group("Other notes group"))
        now = timezone.now()
        self.session = create_session(trainer=self.trainer, group=self.group,
                                      start_at=now, end_at=now + timedelta(hours=1),
                                      location="A", max_participants=10)
        self.trainer_url = f"/api/trainer/sessions/{self.session.id}/participants/{self.student.id}/notes/"
        self.admin_url = f"/api/admin/participants/{self.student.id}/notes/"

    def post(self, url, body):
        return self.client.post(url, data=json.dumps({"body": body}), content_type="application/json")

    def patch(self, url, body):
        return self.client.patch(url, data=json.dumps({"body": body}), content_type="application/json")

    def test_trainer_birth_date_and_staff_notes_are_separate_from_client_payload(self):
        self.client.force_login(self.trainer.user)
        detail = self.client.get(f"/api/trainer/sessions/{self.session.id}/")
        self.assertEqual(detail.json()["students"][0]["birth_date"], "2015-05-10")
        created = self.post(self.trainer_url, "Private instruction")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.client.get(self.trainer_url).json()["notes"][0]["body"], "Private instruction")
        self.assertEqual(self.client.get(f"/api/trainer/sessions/{self.session.id}/").json()["students"][0]["has_internal_notes"], True)
        self.client.force_login(self.student.parent.user)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 403)
        self.assertEqual(self.client.get(self.admin_url).status_code, 403)
        self.assertNotIn("Private instruction", self.client.get("/api/client/overview/").content.decode())

    def test_trainer_author_and_admin_can_manage_but_other_trainer_cannot(self):
        self.client.force_login(self.trainer.user)
        note = self.post(self.trainer_url, "First").json()
        detail_url = f"{self.trainer_url}{note['id']}/"
        updated = self.patch(detail_url, "Corrected")
        self.assertEqual(updated.status_code, 200)
        self.assertTrue(updated.json()["edited"])
        own_second_note = self.post(self.trainer_url, "Remove my note").json()
        self.assertEqual(self.client.delete(f"{self.trainer_url}{own_second_note['id']}/").status_code, 200)
        self.client.force_login(self.other_trainer.user)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 404)
        self.assertEqual(self.patch(detail_url, "No access").status_code, 404)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(self.admin_url).json()["notes"][0]["body"], "Corrected")
        self.assertEqual(self.patch(f"{self.admin_url}{note['id']}/", "Administrator correction").status_code, 200)
        self.assertEqual(self.client.delete(f"{self.admin_url}{note['id']}/").status_code, 200)
        self.assertFalse(ParticipantNote.objects.filter(pk=note["id"]).exists())
        for entry in AuditLogEntry.objects.filter(action__startswith="participant.note_"):
            self.assertNotIn("First", str(entry.changes))
            self.assertNotIn("Corrected", str(entry.changes))

    def test_outside_roster_and_cancelled_session_rules(self):
        self.client.force_login(self.trainer.user)
        outside_url = f"/api/trainer/sessions/{self.session.id}/participants/{self.outsider.id}/notes/"
        self.assertEqual(self.client.get(outside_url).status_code, 403)
        self.session.is_cancelled = True
        self.session.save(update_fields=["is_cancelled"])
        self.assertEqual(self.client.get(self.trainer_url).status_code, 200)
        self.assertEqual(self.post(self.trainer_url, "No new note").status_code, 403)

    def test_past_session_remains_accessible_and_other_authors_note_is_read_only(self):
        self.session.start_at = timezone.now() - timedelta(days=2, hours=1)
        self.session.end_at = timezone.now() - timedelta(days=2)
        self.session.save(update_fields=["start_at", "end_at"])
        self.client.force_login(self.admin)
        note = self.post(self.admin_url, "Administrator note").json()
        self.client.force_login(self.trainer.user)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 200)
        self.assertEqual(self.patch(f"{self.trainer_url}{note['id']}/", "Change").status_code, 403)
        self.assertEqual(self.client.delete(f"{self.trainer_url}{note['id']}/").status_code, 403)
        self.assertEqual(self.post(self.trainer_url, "Trainer note").status_code, 201)

    def test_note_validation_and_privacy_export(self):
        self.client.force_login(self.admin)
        self.assertEqual(self.post(self.admin_url, "   ").status_code, 400)
        self.assertEqual(self.post(self.admin_url, "x" * 4001).status_code, 400)
        self.assertEqual(self.post(self.admin_url, "Private export text").status_code, 201)
        exported = self.client.get(f"/api/admin/privacy/clients/{self.student.parent_id}/export/")
        self.assertEqual(exported.status_code, 200)
        with ZipFile(BytesIO(exported.content)) as archive:
            data = json.loads(archive.read("client-data.json"))
        self.assertEqual(data["internal_notes"][0]["body"], "Private export text")

    def test_legacy_move_and_anonymization_remove_note_and_birth_date(self):
        self.student.admin_comments = "Old private text"
        self.student.save(update_fields=["admin_comments"])
        import_module("students.migrations.0007_participant_notes").move_legacy_comments(apps, None)
        self.student.refresh_from_db()
        self.assertEqual(self.student.admin_comments, "")
        self.assertTrue(ParticipantNote.objects.filter(student=self.student, body="Old private text", imported=True).exists())
        anonymize_parent_account(self.student.parent, actor=self.admin)
        self.student.refresh_from_db()
        self.assertIsNone(self.student.birth_date)
        self.assertFalse(self.student.internal_notes.exists())
