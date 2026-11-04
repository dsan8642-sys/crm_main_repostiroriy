from io import BytesIO
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from accounts.privacy import anonymize_parent_account
from scheduling.models import Session

from . import factories as f


def jpeg(color="red"):
    image = Image.new("RGB", (512, 512), color)
    buffer = BytesIO()
    image.save(buffer, "JPEG")
    return SimpleUploadedFile("photo.jpg", buffer.getvalue(), content_type="image/jpeg")


class ParticipantPhotoTests(TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        media = override_settings(MEDIA_ROOT=directory.name)
        media.enable()
        self.addCleanup(media.disable)
        self.admin = f.make_admin()
        self.parent = f.make_parent()
        self.group = f.make_group()
        self.student = f.make_student(parent=self.parent, group=self.group)
        self.trainer = f.make_trainer()
        self.other_trainer = f.make_trainer()
        self.other_student = f.make_student(parent=f.make_parent(), first="Other", last="Swimmer")
        self.session = Session.objects.create(
            group=self.group, trainer=self.trainer,
            start_at=f.dt(2026, 10, 28, 17), end_at=f.dt(2026, 10, 28, 18),
            location="Pool", max_participants=10,
        )
        self.admin_url = f"/api/admin/participants/{self.student.id}/photo/"
        self.trainer_url = f"/api/trainer/sessions/{self.session.id}/participants/{self.student.id}/photo/"

    def test_upload_visibility_replace_archive_export_and_anonymize(self):
        self.client.force_login(self.admin)
        first = self.client.post(self.admin_url, {"photo": jpeg()})
        self.assertEqual(first.status_code, 200)
        self.student.refresh_from_db()
        old_name = self.student.photo.name
        self.assertTrue(first.json()["photo_version"])
        self.assertEqual(self.client.get(self.admin_url)["Cache-Control"], "private, no-store")

        self.client.force_login(self.parent.user)
        self.assertEqual(self.client.get(self.admin_url).status_code, 403)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 403)
        self.assertEqual(self.client.post(self.admin_url, {"photo": jpeg()}).status_code, 403)

        self.client.force_login(self.other_trainer.user)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 404)
        self.client.force_login(self.trainer.user)
        self.assertEqual(self.client.get(self.trainer_url).status_code, 200)
        self.assertEqual(self.client.get(f"/api/trainer/sessions/{self.session.id}/participants/{self.other_student.id}/photo/").status_code, 403)
        self.assertEqual(self.client.post(self.admin_url, {"photo": jpeg()}).status_code, 403)

        self.client.force_login(self.admin)
        self.assertEqual(self.client.post(self.admin_url, {"photo": SimpleUploadedFile("bad.jpg", b"bad")}).status_code, 400)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.post(self.admin_url, {"photo": jpeg("blue")}).status_code, 200)
        self.student.refresh_from_db()
        self.assertNotEqual(old_name, self.student.photo.name)
        self.assertFalse(self.student.photo.storage.exists(old_name))

        self.assertEqual(self.client.delete(f"/api/admin/clients/{self.parent.id}/").status_code, 200)
        self.student.refresh_from_db()
        self.assertTrue(self.student.photo)
        self.assertEqual(self.client.get(self.admin_url).status_code, 200)
        exported = self.client.get(f"/api/admin/privacy/clients/{self.parent.id}/export/")
        with ZipFile(BytesIO(exported.content)) as archive:
            self.assertIn(f"photos/participant-{self.student.id}.jpg", archive.namelist())

        photo_name = self.student.photo.name
        anonymize_parent_account(self.parent, actor=self.admin)
        self.student.refresh_from_db()
        self.assertFalse(self.student.photo)
        self.assertFalse(self.student.photo.storage.exists(photo_name))

    def test_delete_photo(self):
        self.client.force_login(self.admin)
        self.client.post(self.admin_url, {"photo": jpeg()})
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self.admin_url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["has_photo"])
        self.assertEqual(self.client.get(self.admin_url).status_code, 404)
