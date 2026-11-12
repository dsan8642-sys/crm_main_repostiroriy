import json
from io import StringIO

from django.test import Client, TestCase
from django.core.management import call_command
from django.utils import timezone
from datetime import timedelta

from accounts.models import AdminOTPDevice, LoginAttemptWindow, ParentAccount
from accounts.otp import totp_code
from . import factories as f


def post(client, path, payload):
    return client.post(path, data=json.dumps(payload), content_type="application/json")


class OptionalAdminMfaTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("mfa_owner")
        self.client.force_login(self.admin)

    def test_optional_setup_then_both_admin_interfaces_require_code(self):
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 200)
        setup = post(self.client, "/api/auth/mfa/setup/", {"current_password": "Str0ngPass!123"})
        self.assertEqual(setup.status_code, 200, setup.content)
        secret = setup.json()["secret"]
        self.assertIn("otpauth://", setup.json()["uri"])
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 200)
        verified = post(self.client, "/api/auth/mfa/verify/", {"code": totp_code(secret)})
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 200)

        other = Client()
        other.force_login(self.admin)
        blocked = other.get("/api/admin/dashboard/")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["code"], "mfa_required")
        self.assertEqual(other.get("/admin/").status_code, 302)
        self.assertEqual(other.get("/api/me/").json()["mfa_required"], True)
        self.assertEqual(post(other, "/api/auth/mfa/verify/", {"code": totp_code(secret)}).status_code, 400)

    def test_console_reset_keeps_enforcement_and_invalidates_session(self):
        setup = post(self.client, "/api/auth/mfa/setup/", {"current_password": "Str0ngPass!123"})
        self.assertEqual(post(self.client, "/api/auth/mfa/verify/", {"code": totp_code(setup.json()["secret"])}).status_code, 200)
        output = StringIO()
        call_command("setup_admin_otp", self.admin.username, "--reset", stdout=output)
        self.assertNotIn("Secret:", output.getvalue())
        self.assertNotIn("otpauth://", output.getvalue())
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/mfa/status/").json()["configured"], False)
        recovery = post(self.client, "/api/auth/mfa/setup/", {"current_password": "Str0ngPass!123"})
        self.assertEqual(recovery.status_code, 200)
        self.assertEqual(post(self.client, "/api/auth/mfa/verify/", {"code": totp_code(recovery.json()["secret"])}).status_code, 200)
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 200)

    def test_setup_password_recheck_is_rate_limited(self):
        for _ in range(5):
            self.assertEqual(post(self.client, "/api/auth/mfa/setup/", {
                "current_password": "wrong",
            }).status_code, 400)
        self.assertEqual(post(self.client, "/api/auth/mfa/setup/", {
            "current_password": "Str0ngPass!123",
        }).status_code, 429)


class PhoneLoginLimitTest(TestCase):
    def test_normalized_phone_is_indexed_and_unknown_attempts_are_limited(self):
        account = f.make_parent("phone_limit", phone="+48 500-111-222")
        self.assertEqual(ParentAccount.objects.get(pk=account.pk).phone_normalized, "48500111222")
        for _ in range(5):
            response = post(self.client, "/api/auth/login/", {"login": "999999999", "password": "wrong"})
            self.assertNotEqual(response.status_code, 200)
        blocked = post(self.client, "/api/auth/login/", {"login": "999999999", "password": "wrong"})
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(LoginAttemptWindow.objects.count(), 2)

    def test_phone_aliases_share_the_same_limit_and_expired_rows_are_pruned(self):
        old = LoginAttemptWindow.objects.create(
            key="a" * 64, count=2, window_started_at=timezone.now() - timedelta(days=2))
        for value in ("+48 999-999-999", "48999999999", "+48(999)999999", "48 999 999 999", "48-999-999-999"):
            self.assertNotEqual(post(self.client, "/api/auth/login/", {
                "login": value, "password": "wrong",
            }).status_code, 200)
        self.assertFalse(LoginAttemptWindow.objects.filter(pk=old.pk).exists())
        blocked = post(self.client, "/api/auth/login/", {
            "login": "+48 999 999 999", "password": "wrong",
        })
        self.assertEqual(blocked.status_code, 429)
