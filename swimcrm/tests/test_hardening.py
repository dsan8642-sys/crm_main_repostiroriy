"""Section 6: uploaded receipt files are validated by type (extension + signature)
and size before they are accepted."""
import os
import subprocess
import sys
from datetime import date

from django.contrib.auth import authenticate
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from axes.handlers.proxy import AxesProxyHandler
from billing.models import Payment, PaymentStatus, ReceiptFile

from . import factories as f

PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"


class ProductionSettingsRule(SimpleTestCase):
    def _import_settings(self, **env_updates):
        env = os.environ.copy()
        for key in [
            "DEBUG", "SECRET_KEY", "ALLOWED_HOSTS", "DJANGO_ENV",
            "SWIMCRM_RUNTIME_DIR", "STATIC_ROOT", "MEDIA_ROOT",
            "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT",
        ]:
            env.pop(key, None)
        env.update(env_updates)
        return subprocess.run(
            [sys.executable, "-c", "import config.settings"],
            cwd=os.getcwd(),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_production_requires_explicit_secret_key(self):
        result = self._import_settings(DEBUG="0", ALLOWED_HOSTS="crm.example.com")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SECRET_KEY", result.stderr)

    def test_production_rejects_wildcard_allowed_hosts(self):
        result = self._import_settings(
            DEBUG="0",
            SECRET_KEY="release-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789",
            ALLOWED_HOSTS="*",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ALLOWED_HOSTS", result.stderr)

    def test_production_environment_rejects_debug_enabled(self):
        result = self._import_settings(DJANGO_ENV="production", DEBUG="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DEBUG=1", result.stderr)

    def test_production_like_settings_import_cleanly(self):
        result = self._import_settings(
            DJANGO_ENV="production",
            DEBUG="0",
            SECRET_KEY="release-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789",
            ALLOWED_HOSTS="crm.example.com",
            POSTGRES_DB="swimcrm",
            POSTGRES_USER="swimcrm",
            POSTGRES_PASSWORD="release-db-password",
            POSTGRES_HOST="db.example.internal",
            POSTGRES_PORT="5432",
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_rejects_sqlite_fallback(self):
        result = self._import_settings(
            DJANGO_ENV="production",
            DEBUG="0",
            SECRET_KEY="release-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789",
            ALLOWED_HOSTS="crm.example.com",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("POSTGRES_DB", result.stderr)

    def test_production_rejects_media_or_static_inside_source_tree(self):
        source_tree_path = os.getcwd()
        result = self._import_settings(
            DJANGO_ENV="production",
            DEBUG="0",
            SECRET_KEY="release-secret-key-abcdefghijklmnopqrstuvwxyz-0123456789",
            ALLOWED_HOSTS="crm.example.com",
            POSTGRES_DB="swimcrm",
            POSTGRES_USER="swimcrm",
            POSTGRES_PASSWORD="release-db-password",
            POSTGRES_HOST="db.example.internal",
            POSTGRES_PORT="5432",
            STATIC_ROOT=source_tree_path,
            MEDIA_ROOT=source_tree_path,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source tree", result.stderr)


class ObservabilitySettingsRule(SimpleTestCase):
    def test_structured_console_logging_is_configured(self):
        logging = settings.LOGGING

        self.assertEqual(logging["handlers"]["console"]["formatter"], "structured")
        self.assertIn("level=%(levelname)s", logging["formatters"]["structured"]["format"])
        self.assertEqual(logging["loggers"]["django.request"]["level"], "ERROR")
        self.assertEqual(logging["loggers"]["audit"]["level"], os.environ.get("AUDIT_LOG_LEVEL", "INFO"))


class ReceiptFileValidationRule(TestCase):
    def setUp(self):
        self.payment = Payment.objects.create(
            student=f.make_student(), amount_minor=1000, currency="PLN",
            paid_at=date.today(), status=PaymentStatus.PENDING)

    def _clean(self, name, content):
        ReceiptFile(payment=self.payment,
                    file=SimpleUploadedFile(name, content)).full_clean()

    def test_valid_pdf_and_png_pass(self):
        self._clean("receipt.pdf", PDF)
        self._clean("scan.png", PNG)  # must not raise

    def test_wrong_extension_rejected(self):
        with self.assertRaises(ValidationError):
            self._clean("receipt.txt", b"just text")

    def test_renamed_file_rejected_by_signature(self):
        # .pdf extension but the bytes are not a real PDF/JPG/PNG
        with self.assertRaises(ValidationError):
            self._clean("evil.pdf", b"MZ\x90\x00 not a document")

    @override_settings(RECEIPT_MAX_SIZE_MB=1)
    def test_oversize_rejected(self):
        big = PDF + b"0" * (1 * 1024 * 1024 + 10)  # just over 1 MB
        with self.assertRaises(ValidationError):
            self._clean("big.pdf", big)


@override_settings(AXES_FAILURE_LIMIT=3)
class LoginLockoutRule(TestCase):
    """Section 6: repeated failed logins lock the (username, IP) pair (django-axes).

    Tested at the authenticate() level (no template rendering) to stay clear of a
    Django-5.1-on-Python-3.14 bug in the test client's template-context copy.
    """

    def setUp(self):
        f.make_admin(username="boss")  # real account; we submit a wrong password

    def test_lockout_after_repeated_failures(self):
        rf = RequestFactory()
        creds = {"username": "boss", "password": "wrong"}
        for _ in range(3):  # reach AXES_FAILURE_LIMIT with the wrong password
            self.assertIsNone(authenticate(rf.post("/admin/login/", creds), **creds))
        # the (username, IP=127.0.0.1) pair is now locked
        self.assertTrue(
            AxesProxyHandler.is_locked(rf.post("/admin/login/", creds), credentials=creds))
