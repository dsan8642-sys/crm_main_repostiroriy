import json

from django.test import Client, TestCase

from accounts.models import Role
from audit.models import AuditLogEntry

from . import factories as f


class AdminCredentialsApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("credentials_admin")
        self.client.force_login(self.admin)

    def test_admin_can_change_own_username_and_password_safely(self):
        response = self.client.patch(
            "/api/admin/system/credentials/",
            data=json.dumps({
                "username": "new_credentials_admin",
                "current_password": "Str0ngPass!123",
                "new_password": "DifferentStrongPass!456",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.username, "new_credentials_admin")
        self.assertEqual(self.admin.role, Role.ADMIN)
        self.assertTrue(self.admin.is_staff)
        self.assertTrue(self.admin.is_superuser)
        self.assertFalse(self.admin.password.startswith("DifferentStrongPass!456"))
        self.assertTrue(self.admin.check_password("DifferentStrongPass!456"))
        self.assertEqual(self.client.get("/api/me/").status_code, 200)

        new_credentials = Client().post(
            "/api/auth/login/",
            {"login": "new_credentials_admin", "password": "DifferentStrongPass!456"},
            content_type="application/json",
            REMOTE_ADDR="192.0.2.10",
        )
        old_credentials = Client().post(
            "/api/auth/login/",
            {"login": "credentials_admin", "password": "Str0ngPass!123"},
            content_type="application/json",
            REMOTE_ADDR="192.0.2.11",
        )
        self.assertEqual(new_credentials.status_code, 200)
        self.assertEqual(old_credentials.status_code, 400)

        entry = AuditLogEntry.objects.get(action="admin.credentials.updated")
        self.assertEqual(entry.actor_id, self.admin.id)
        self.assertEqual(entry.entity_type, "User")
        self.assertEqual(entry.changes, {
            "username_changed": True,
            "password_changed": True,
        })
        self.assertNotIn("DifferentStrongPass!456", str(entry.changes))

    def test_current_password_is_required_and_wrong_password_changes_nothing(self):
        response = self.client.patch(
            "/api/admin/system/credentials/",
            data=json.dumps({
                "username": "must_not_change",
                "current_password": "wrong-password",
                "new_password": "DifferentStrongPass!456",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.username, "credentials_admin")
        self.assertTrue(self.admin.check_password("Str0ngPass!123"))
        self.assertFalse(
            AuditLogEntry.objects.filter(action="admin.credentials.updated").exists()
        )
