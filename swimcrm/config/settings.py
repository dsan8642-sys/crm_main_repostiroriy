"""
Django settings for the swim-school CRM (MVP core).

Money is stored as integer minor units + ISO currency code (see common.money).
Default DB is SQLite for zero-config local runs / tests; PostgreSQL is used in
production (set DATABASE_URL or the POSTGRES_* env vars) and is required for the
trainer double-booking exclusion constraint (see scheduling migration).
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

def _env_bool(name, default):
    return os.environ.get(name, default) == "1"


def _env_list(name, default):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def _path_is_inside(child, parent):
    child_path = Path(child).resolve()
    parent_path = Path(parent).resolve()
    return child_path == parent_path or parent_path in child_path.parents


ENVIRONMENT = os.environ.get("DJANGO_ENV", "development").lower()
DEBUG = _env_bool("DEBUG", "1")

if ENVIRONMENT in {"prod", "production"} and DEBUG:
    raise ImproperlyConfigured("Production environment cannot start with DEBUG=1.")

_secret_key = os.environ.get("SECRET_KEY")
if DEBUG:
    SECRET_KEY = _secret_key or "dev-insecure-change-me"
else:
    if not _secret_key or _secret_key == "dev-insecure-change-me" or len(_secret_key) < 50:
        raise ImproperlyConfigured("Set SECRET_KEY to a unique value of at least 50 characters for production.")
    SECRET_KEY = _secret_key

ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]" if DEBUG else "")
if not DEBUG and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured("Set ALLOWED_HOSTS to explicit production hostnames; wildcard '*' is not allowed.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # domain apps
    "accounts",
    "catalog",
    "students",
    "scheduling",
    "attendance.apps.AttendanceConfig",
    "subscriptions",
    "billing.apps.BillingConfig",
    "notifications",
    "payroll",
    "localization",
    "audit",
    "analytics",
    "dataio",
    # security
    "axes",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.middleware.AdminOTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "portal.middleware.ApiExceptionMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Must be last: turns axes lockouts into responses (section 6).
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": [
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ]},
    },
]

WSGI_APPLICATION = "config.wsgi.application"

if os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }
else:
    if ENVIRONMENT in {"prod", "production"}:
        raise ImproperlyConfigured("Production environment requires POSTGRES_DB; SQLite is development-only.")
    sqlite_name = ":memory:" if "test" in sys.argv else BASE_DIR / "db.sqlite3"
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": sqlite_name,
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---- Brute-force lockout (section 6) via django-axes ----
# AxesStandaloneBackend must precede the real auth backend; it enforces lockouts,
# ModelBackend still does the actual credential check.
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]
AXES_FAILURE_LIMIT = int(os.environ.get("AXES_FAILURE_LIMIT", "5"))
AXES_COOLOFF_TIME = timedelta(minutes=int(os.environ.get("AXES_COOLOFF_MINUTES", "30")))
# Lock the (username + IP) pair — not a whole IP, not the user globally.
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True  # a later successful login clears the failure counter

LANGUAGE_CODE = "ru"
TIME_ZONE = "Europe/Warsaw"
SWIMCRM_DEFAULT_LANGUAGE = os.environ.get("SWIMCRM_DEFAULT_LANGUAGE", LANGUAGE_CODE.split("-")[0]).lower()
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
RUNTIME_DIR = Path(os.environ.get(
    "SWIMCRM_RUNTIME_DIR",
    r"C:\SwimCRMRuntime" if (not DEBUG and os.name == "nt") else str(BASE_DIR.parent / ".runtime"),
))
STATIC_ROOT = Path(os.environ.get("STATIC_ROOT", str(RUNTIME_DIR / "staticfiles")))
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", str(RUNTIME_DIR / "uploads")))
MEDIA_URL = os.environ.get("MEDIA_URL", "/media/")
FILE_UPLOAD_PERMISSIONS = 0o640
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o750
if not DEBUG:
    for _setting_name, _path in {"STATIC_ROOT": STATIC_ROOT, "MEDIA_ROOT": MEDIA_ROOT}.items():
        if _path_is_inside(_path, BASE_DIR.parent):
            raise ImproperlyConfigured(f"{_setting_name} must point outside the application source tree in production.")
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---- Domain configuration (no hardcoded magic where the spec forbids it) ----
DEFAULT_CURRENCY = os.environ.get("DEFAULT_CURRENCY", "PLN")
SUBSCRIPTION_GRACE_DAYS = int(os.environ.get("SUBSCRIPTION_GRACE_DAYS", "7"))
RECEIPT_RETENTION_DAYS = int(os.environ.get("RECEIPT_RETENTION_DAYS", "30"))  # rule 10
RECEIPT_MAX_SIZE_MB = int(os.environ.get("RECEIPT_MAX_SIZE_MB", "10"))  # section 6: upload cap

# ---- Security hardening (section 6) ----
# TLS-dependent protections activate outside DEBUG so local dev over plain HTTP
# keeps working; in production (DEBUG=0) they turn on automatically.
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "0" if DEBUG else "1") == "1"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
_default_csrf_trusted_origins = "http://127.0.0.1:5173,http://localhost:5173" if DEBUG else ""
CSRF_TRUSTED_ORIGINS = [
    origin for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", _default_csrf_trusted_origins).split(",")
    if origin
]

# Response security headers.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# HSTS is only meaningful over HTTPS -> production only (1 year, incl. subdomains).
SECURE_HSTS_SECONDS = 0 if DEBUG else int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG

# Behind a TLS-terminating reverse proxy, trust its scheme header. Opt-in only:
# unsafe unless the proxy ALWAYS sets X-Forwarded-Proto (else clients can spoof it).
if os.environ.get("TRUST_PROXY_SSL_HEADER") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@swimcrm.local")

# ---- Observability ----
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
AUDIT_LOG_LEVEL = os.environ.get("AUDIT_LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "ts=%(asctime)s level=%(levelname)s logger=%(name)s module=%(module)s message=%(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
            "level": LOG_LEVEL,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "audit": {
            "handlers": ["console"],
            "level": AUDIT_LOG_LEVEL,
            "propagate": False,
        },
        "axes": {
            "handlers": ["console"],
            "level": os.environ.get("AXES_LOG_LEVEL", "WARNING"),
            "propagate": False,
        },
    },
}

# ---- Notification providers ----
# Email uses Django EMAIL_* settings. SMS/Telegram can run in dry-run mode locally,
# or call real HTTP providers when credentials are present.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_URL = os.environ.get("TELEGRAM_API_URL", "https://api.telegram.org")
TELEGRAM_DRY_RUN = os.environ.get("TELEGRAM_DRY_RUN", "1" if DEBUG else "0") == "1"
SMS_PROVIDER_URL = os.environ.get("SMS_PROVIDER_URL", "")
SMS_API_KEY = os.environ.get("SMS_API_KEY", "")
SMS_SENDER = os.environ.get("SMS_SENDER", "SwimCRM")
SMS_DRY_RUN = os.environ.get("SMS_DRY_RUN", "1" if DEBUG else "0") == "1"

# ---- NocoBase bridge ----
# Read-only integration token for NocoBase external API/data blocks.
# Production deployments must set this to a strong secret.
NOCOBASE_BRIDGE_TOKEN = os.environ.get("NOCOBASE_BRIDGE_TOKEN", "")
# Separate write token for guarded low-risk configuration edited from NocoBase.
# Do not reuse the read-only bridge token in production.
NOCOBASE_CONFIG_TOKEN = os.environ.get("NOCOBASE_CONFIG_TOKEN", "")

# ---- Background jobs (Celery/Redis, with cron-compatible management commands) ----
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_TIMEZONE = TIME_ZONE

# ---- Admin 2FA ----
ADMIN_2FA_REQUIRED = os.environ.get("ADMIN_2FA_REQUIRED", "0" if DEBUG else "1") == "1"
