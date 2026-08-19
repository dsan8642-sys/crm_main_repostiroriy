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

    def test_exact_username_takes_priority_over_another_users_email(self):
        account = f.make_parent(username="shared_login", phone="+48500111223")
        alias_user = f.make_admin(username="different_user")
        alias_user.email = account.user.username
        alias_user.set_password("Different!Pass2026")
        alias_user.save(update_fields=["email", "password"])

        response = self.client.post(
            "/api/auth/login/",
            {"login": "shared_login", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], "shared_login")

    def test_non_exact_username_casing_does_not_override_ambiguous_email(self):
        account = f.make_parent(username="CaseSensitiveLogin", phone="+48500111224")
        alias_user = f.make_admin(username="case_alias_user")
        alias_user.email = "casesensitivelogin"
        alias_user.save(update_fields=["email"])

        response = self.client.post(
            "/api/auth/login/",
            {"login": "CASESENSITIVELOGIN", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.client.session.get("_auth_user_id"))

    def test_ambiguous_normalized_phone_fails_closed(self):
        f.make_parent(username="phone_alias_one", phone="+48500111999")
        f.make_parent(username="phone_alias_two", phone="+48 500 111 999")

        response = self.client.post(
            "/api/auth/login/",
            {"login": "48 (500) 111-999", "password": "Str0ngPass!123"},
            content_type="application/json",
            **self._csrf_headers(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.client.session.get("_auth_user_id"))

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
            "activation_token": issued.json()["activation_token"],
            "password": "Another!Strong2026",
        }, content_type="application/json")
        self.assertEqual(reused.status_code, 400)

    def _issue_activation(self, username, phone):
        admin = f.make_admin(username=f"{username}_admin")
        account = f.make_parent(username=username, phone=phone)
        account.user.set_unusable_password()
        account.user.save(update_fields=["password"])
        admin_client = Client()
        admin_client.force_login(admin)
        issued = admin_client.post(f"/api/admin/clients/{account.id}/activation/")
        self.assertEqual(issued.status_code, 201)
        return issued.json()["activation_token"]

    def test_activation_accepts_eight_char_password_without_complexity(self):
        token = self._issue_activation("simple_pass_client", "+48500111222")

        # 8 chars, lowercase only, no digit/special/uppercase, not a common password.
        response = self.client.post("/api/auth/activate/", {
            "activation_token": token,
            "password": "plywanie",
        }, content_type="application/json")

        self.assertEqual(response.status_code, 200, response.content)

    def test_activation_rejects_password_shorter_than_eight(self):
        token = self._issue_activation("short_pass_client", "+48500111333")

        response = self.client.post("/api/auth/activate/", {
            "activation_token": token,
            "password": "krotkie",  # 7 chars
        }, content_type="application/json")

        self.assertEqual(response.status_code, 400)

    def test_activation_rejects_numeric_only_password(self):
        token = self._issue_activation("numeric_pass_client", "+48500111444")

        response = self.client.post("/api/auth/activate/", {
            "activation_token": token,
            "password": "20260724",  # 8 chars but digits only
        }, content_type="application/json")

        self.assertEqual(response.status_code, 400)

    def test_activation_without_client_id_still_resolves_client(self):
        token = self._issue_activation("token_only_client", "+48500111555")

        response = self.client.post("/api/auth/activate/", {
            "activation_token": token,
            "password": "plywanie",
        }, content_type="application/json")

        self.assertEqual(response.status_code, 200, response.content)

    @override_settings(AXES_FAILURE_LIMIT=5)
    def test_activation_clears_login_lockout_for_canonical_username(self):
        username = "locked_activation_client"
        token = self._issue_activation(username, "+48500111666")
        for _ in range(5):
            failed = self.client.post(
                "/api/auth/login/",
                {"login": username, "password": "wrong-password"},
                content_type="application/json",
                **self._csrf_headers(),
            )
            self.assertNotEqual(failed.status_code, 200)

        activated = self.client.post(
            "/api/auth/activate/",
            {"activation_token": token, "password": "plywanie"},
            content_type="application/json",
        )
        self.assertEqual(activated.status_code, 200, activated.content)

        login_response = self.client.post(
            "/api/auth/login/",
            {"login": username, "password": "plywanie"},
            content_type="application/json",
            **self._csrf_headers(),
        )
        self.assertEqual(login_response.status_code, 200, login_response.content)

    @override_settings(AXES_FAILURE_LIMIT=5)
    def test_recovery_clears_login_lockout_for_canonical_username(self):
        username = "locked_recovery_client"
        admin = f.make_admin(username="locked_recovery_admin")
        account = f.make_parent(username=username, phone="+48500111777")
        admin_client = Client()
        admin_client.force_login(admin)
        issued = admin_client.post(f"/api/admin/clients/{account.id}/access/issue/")
        self.assertEqual(issued.status_code, 201)
        self.assertEqual(issued.json()["login"], username)

        for _ in range(5):
            failed = self.client.post(
                "/api/auth/login/",
                {"login": username, "password": "wrong-password"},
                content_type="application/json",
                **self._csrf_headers(),
            )
            self.assertNotEqual(failed.status_code, 200)

        recovered = self.client.post(
            "/api/auth/activate/",
            {
                "activation_token": issued.json()["activation_token"],
                "password": "plywanie",
            },
            content_type="application/json",
        )
        self.assertEqual(recovered.status_code, 200, recovered.content)
        self.assertEqual(recovered.json()["login"], username)

        login_response = self.client.post(
            "/api/auth/login/",
            {"login": username, "password": "plywanie"},
            content_type="application/json",
            **self._csrf_headers(),
        )
        self.assertEqual(login_response.status_code, 200, login_response.content)
