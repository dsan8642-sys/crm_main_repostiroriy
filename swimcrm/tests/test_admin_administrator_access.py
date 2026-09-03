import json

from django.test import Client, TestCase

from accounts.models import Role, User
from audit.models import AuditLogEntry

from . import factories as f


class AdministratorAccessApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("access_owner")
        self.client.force_login(self.admin)

    def test_admin_can_create_revoke_and_restore_a_separate_administrator(self):
        password = "DifferentStrongPass!456"
        created = self.client.post(
            "/api/admin/system/administrators/",
            data=json.dumps({
                "full_name": "Second Administrator",
                "username": "second_admin",
                "email": "second@example.test",
                "password": password,
                "current_password": "Str0ngPass!123",
            }),
            content_type="application/json",
        )

        self.assertEqual(created.status_code, 201)
        user = User.objects.get(username="second_admin")
        self.assertEqual(user.role, Role.ADMIN)
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password(password))
        self.assertNotIn(password, str(AuditLogEntry.objects.get(action="admin.access.created").changes))

        session = Client()
        self.assertEqual(session.post("/api/auth/login/", data=json.dumps({
            "login": user.username, "password": password,
        }), content_type="application/json").status_code, 200)
        self.assertEqual(session.get("/api/admin/dashboard/").status_code, 200)

        revoked = self.client.post(
            f"/api/admin/system/administrators/{user.id}/revoke/",
            data=json.dumps({"current_password": "Str0ngPass!123"}),
            content_type="application/json",
        )
        self.assertEqual(revoked.status_code, 200)
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertEqual(session.get("/api/admin/dashboard/").status_code, 403)
        self.assertEqual(AuditLogEntry.objects.get(action="admin.access.revoked").actor_id, self.admin.id)

        restored = self.client.post(
            f"/api/admin/system/administrators/{user.id}/restore/",
            data=json.dumps({"current_password": "Str0ngPass!123"}),
            content_type="application/json",
        )
        self.assertEqual(restored.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertEqual(AuditLogEntry.objects.get(action="admin.access.restored").actor_id, self.admin.id)

    def test_admin_cannot_revoke_own_access(self):
        response = self.client.post(
            f"/api/admin/system/administrators/{self.admin.id}/revoke/",
            data=json.dumps({"current_password": "Str0ngPass!123"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_secondary_admin_cannot_manage_administrator_access(self):
        secondary = User.objects.create_user(
            username="secondary_admin", password="SecondaryPass!456", role=Role.ADMIN,
        )
        secondary_client = Client()
        secondary_client.force_login(secondary)

        self.assertTrue(self.client.get("/api/me/").json()["can_manage_administrators"])
        self.assertFalse(secondary_client.get("/api/me/").json()["can_manage_administrators"])

        create = secondary_client.post(
            "/api/admin/system/administrators/",
            data=json.dumps({
                "full_name": "Blocked Administrator",
                "username": "blocked_admin",
                "password": "DifferentStrongPass!456",
                "current_password": "SecondaryPass!456",
            }),
            content_type="application/json",
        )
        revoke = secondary_client.post(
            f"/api/admin/system/administrators/{self.admin.id}/revoke/",
            data=json.dumps({"current_password": "SecondaryPass!456"}),
            content_type="application/json",
        )

        self.assertEqual(create.status_code, 403)
        self.assertEqual(revoke.status_code, 403)
        self.assertFalse(User.objects.filter(username="blocked_admin").exists())
        self.assertFalse(AuditLogEntry.objects.filter(actor=secondary).exists())
