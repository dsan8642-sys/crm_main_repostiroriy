from django.http import HttpResponse
from django.test import Client, TestCase, override_settings

from accounts.models import Role, User

from . import factories as f


def csrf_failure(request, reason=""):
    return HttpResponse("CSRF failed", status=403)


class ProductionAuthApiTest(TestCase):
    def _csrf_headers(self, client=None):
        client = client or self.client
        response = client.get("/api/csrf/")
        return {"HTTP_X_CSRFTOKEN": response.cookies["csrftoken"].value}

    def test_login_with_username_opens_admin_session(self):
        f.make_admin(username="prod_admin")

        response = self.client.post(
            "/api/auth/login/",
            {"login": "prod_admin", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "admin")
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 200)

    def test_login_with_client_email_opens_client_session(self):
        account = f.make_parent(username="prod_client", phone="+48500111222")
        account.email = "client@example.test"
        account.user.email = "client-user@example.test"
        account.user.save(update_fields=["email"])
        account.save(update_fields=["email"])

        response = self.client.post(
            "/api/auth/login/",
            {"login": "client@example.test", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "client")
        self.assertEqual(self.client.get("/api/client/overview/").status_code, 200)

    @override_settings(CSRF_FAILURE_VIEW="tests.test_auth_api.csrf_failure")
    def test_login_requires_csrf_when_checks_are_enforced(self):
        f.make_admin(username="csrf_admin")
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.raise_request_exception = False

        response = csrf_client.post(
            "/api/auth/login/",
            {"login": "csrf_admin", "password": "Str0ngPass!123"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_login_rejects_invalid_password(self):
        f.make_admin(username="bad_password_admin")

        response = self.client.post(
            "/api/auth/login/",
            {"login": "bad_password_admin", "password": "wrong"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.client.session.get("_auth_user_id"))

    def test_login_rejects_inactive_user(self):
        user = f.make_admin(username="inactive_admin")
        user.is_active = False
        user.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/auth/login/",
            {"login": "inactive_admin", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)

    def test_login_rejects_inactive_trainer_profile(self):
        trainer = f.make_trainer(username="inactive_trainer")
        trainer.is_active = False
        trainer.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/auth/login/",
            {"login": "inactive_trainer", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)

    def test_client_session_cannot_open_admin_api(self):
        f.make_parent(username="prod_client_rights")
        self.client.post(
            "/api/auth/login/",
            {"login": "prod_client_rights", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        response = self.client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 403)

    def test_logout_destroys_session(self):
        f.make_admin(username="logout_admin")
        self.client.post(
            "/api/auth/login/",
            {"login": "logout_admin", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        response = self.client.post("/api/auth/logout/", **self._csrf_headers())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/me/").status_code, 403)

    def test_login_returns_client_alias_for_parent_role(self):
        f.make_parent(username="alias_client")

        response = self.client.post(
            "/api/auth/login/",
            {"login": "alias_client", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "client")
        self.assertEqual(response.json()["user"]["internal_role"], Role.PARENT)

    def test_missing_credentials_return_400(self):
        response = self.client.post(
            "/api/auth/login/",
            {"login": "", "password": ""},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)

    def test_parent_user_without_account_cannot_login(self):
        User.objects.create_user(username="orphan_parent", password="Str0ngPass!123", role=Role.PARENT)

        response = self.client.post(
            "/api/auth/login/",
            {"login": "orphan_parent", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)

    def test_imported_client_can_activate_existing_profile_without_losing_history(self):
        admin = f.make_admin(username="activation_admin")
        account = f.make_parent(username="imported_client", phone="+48500999111")
        account.email = "imported@example.test"
        account.save(update_fields=["email"])
        account.user.set_unusable_password()
        account.user.save(update_fields=["password"])
        student = f.make_student(parent=account)

        admin_client = Client()
        admin_client.force_login(admin)
        issued = admin_client.post(f"/api/admin/clients/{account.id}/activation/")
        self.assertEqual(issued.status_code, 201)

        activated = self.client.post("/api/auth/activate/", {
            "client_id": account.id,
            "activation_token": issued.json()["activation_token"],
            "password": "Q7!vL2#pN9$xR4@m",
        }, content_type="application/json")
        self.assertEqual(activated.status_code, 200)
        self.assertEqual(account.students.get().id, student.id)

        login_response = self.client.post("/api/auth/login/", {
            "login": "imported@example.test",
            "password": "Q7!vL2#pN9$xR4@m",
        }, content_type="application/json")
        self.assertEqual(login_response.status_code, 200)

        reused = self.client.post("/api/auth/activate/", {
            "client_id": account.id,
            "activation_token": issued.json()["activation_token"],
            "password": "Another!Strong2026",
        }, content_type="application/json")
        self.assertEqual(reused.status_code, 400)
