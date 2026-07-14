from django.http import HttpResponse
from django.test import RequestFactory
from django.test import TestCase, override_settings
from django.urls import reverse

from accounts.middleware import AdminOTPMiddleware, OTP_SESSION_KEY
from accounts.models import AdminOTPDevice
from accounts.otp import generate_totp_secret, provisioning_uri, totp_code, verify_totp

from . import factories as f


class TotpRule(TestCase):
    def test_totp_code_verifies(self):
        secret = generate_totp_secret()
        code = totp_code(secret, for_time=1_800_000_000)
        self.assertTrue(verify_totp(secret, code, for_time=1_800_000_000))
        self.assertFalse(verify_totp(secret, "000000", for_time=1_800_000_000))

    def test_provisioning_uri_contains_secret(self):
        secret = generate_totp_secret()
        uri = provisioning_uri(secret=secret, username="admin")
        self.assertIn("otpauth://totp/", uri)
        self.assertIn(secret, uri)


@override_settings(ADMIN_2FA_REQUIRED=True)
class AdminOtpMiddlewareRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="otp_admin")
        self.secret = generate_totp_secret()
        AdminOTPDevice.objects.create(
            user=self.admin, secret=self.secret, is_confirmed=True)

    def test_admin_requires_otp_before_admin_index(self):
        self.client.force_login(self.admin)
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("admin-otp"), response["Location"])

    def test_admin_can_verify_otp(self):
        self.client.force_login(self.admin)
        response = self.client.post(reverse("admin-otp"), {
            "code": totp_code(self.secret),
            "next": "/admin/",
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/admin/")
        self.assertIn("admin_2fa_verified_at", self.client.session)

    def test_admin_otp_rejects_external_next_redirect(self):
        self.client.force_login(self.admin)

        response = self.client.post(reverse("admin-otp"), {
            "code": totp_code(self.secret),
            "next": "https://attacker.example/phish",
        })

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], reverse("admin:index"))
        self.assertIn("admin_2fa_verified_at", self.client.session)


@override_settings(
    ADMIN_2FA_REQUIRED=True,
    DEBUG=False,
    SECURE_SSL_REDIRECT=False,
    ALLOWED_HOSTS=["testserver"],
)
class AdminOtpProductionFlow(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="prod_otp_admin")
        self.factory = RequestFactory()
        self.secret = generate_totp_secret()
        AdminOTPDevice.objects.create(
            user=self.admin,
            secret=self.secret,
            is_confirmed=True,
        )

    def test_admin_login_requires_otp_before_admin_access(self):
        login_response = self.client.post("/admin/login/?next=/admin/", {
            "username": "prod_otp_admin",
            "password": "Str0ngPass!123",
            "next": "/admin/",
        })
        self.assertEqual(login_response.status_code, 302)
        self.assertEqual(login_response["Location"], "/admin/")

        blocked = self.client.get("/admin/")
        self.assertEqual(blocked.status_code, 302)
        self.assertTrue(blocked["Location"].startswith(reverse("admin-otp")))
        self.assertNotIn(OTP_SESSION_KEY, self.client.session)

        invalid = self.client.post(reverse("admin-otp"), {
            "code": "000000",
            "next": "/admin/",
        })
        self.assertEqual(invalid.status_code, 400)
        self.assertNotIn(OTP_SESSION_KEY, self.client.session)

        verified = self.client.post(reverse("admin-otp"), {
            "code": totp_code(self.secret),
            "next": "/admin/",
        })
        self.assertEqual(verified.status_code, 302)
        self.assertEqual(verified["Location"], "/admin/")
        self.assertIn(OTP_SESSION_KEY, self.client.session)

        request = self.factory.get("/admin/")
        request.user = self.admin
        request.session = self.client.session
        middleware = AdminOTPMiddleware(lambda req: HttpResponse("admin ok"))
        admin_index = middleware(request)
        self.assertEqual(admin_index.status_code, 200)
        self.assertEqual(admin_index.content, b"admin ok")

    def test_admin_without_confirmed_otp_device_is_blocked(self):
        self.admin.admin_otp_device.delete()
        login_response = self.client.post("/admin/login/?next=/admin/", {
            "username": "prod_otp_admin",
            "password": "Str0ngPass!123",
            "next": "/admin/",
        })
        self.assertEqual(login_response.status_code, 302)

        blocked = self.client.get("/admin/")
        self.assertEqual(blocked.status_code, 302)
        self.assertTrue(blocked["Location"].startswith(reverse("admin-otp")))

        setup_required = self.client.get(reverse("admin-otp"))
        self.assertEqual(setup_required.status_code, 403)
