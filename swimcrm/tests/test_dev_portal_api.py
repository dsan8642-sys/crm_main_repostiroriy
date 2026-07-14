from django.test import Client, TestCase, override_settings

from accounts.models import Role, User

from . import factories as f


@override_settings(DEBUG=True)
class DevPortalApiRule(TestCase):
    def test_csrf_endpoint_sets_cookie(self):
        response = self.client.get("/api/csrf/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.assertIn("csrftoken", response.cookies)

    def test_dev_login_admin_opens_admin_api(self):
        f.make_admin(username="dev_admin_login")

        response = self.client.post("/api/dev-login/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "admin")

        me = self.client.get("/api/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], "admin")

        dashboard = self.client.get("/api/admin/dashboard/")
        self.assertEqual(dashboard.status_code, 200)

    def test_dev_login_is_csrf_exempt_for_local_role_switching(self):
        f.make_admin(username="dev_admin_csrf")
        csrf_client = Client(enforce_csrf_checks=True)

        response = csrf_client.post("/api/dev-login/admin/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "admin")

    def test_dev_login_trainer_opens_trainer_api(self):
        f.make_trainer(username="dev_trainer_login")

        response = self.client.post("/api/dev-login/trainer/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "trainer")

        sessions = self.client.get("/api/trainer/sessions/")
        self.assertEqual(sessions.status_code, 200)

    def test_dev_login_client_opens_client_api(self):
        f.make_parent(username="dev_client_login", phone="+48500999111")

        response = self.client.post("/api/dev-login/client/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "client")

        overview = self.client.get("/api/client/overview/")
        self.assertEqual(overview.status_code, 200)

    def test_dev_login_creates_minimal_account_when_empty(self):
        response = self.client.post("/api/dev-login/client/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(username="dev_client", role=Role.PARENT).exists())

    def test_unknown_dev_role_returns_400(self):
        response = self.client.post("/api/dev-login/owner/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    @override_settings(DEBUG=False)
    def test_dev_login_is_not_available_outside_debug(self):
        response = self.client.post("/api/dev-login/admin/")

        self.assertEqual(response.status_code, 404)
