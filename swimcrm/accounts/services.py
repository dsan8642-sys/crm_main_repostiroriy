import hashlib
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import AdminOTPDevice, LoginAttemptWindow, Role, normalize_phone


def admin_mfa_required(user):
    if not user.is_authenticated or not (user.role == Role.ADMIN or user.is_superuser or user.is_staff):
        return False
    return AdminOTPDevice.objects.filter(user=user, enforced=True).exists()


def admin_mfa_verified(request):
    if not admin_mfa_required(request.user):
        return True
    device = AdminOTPDevice.objects.filter(user=request.user).first()
    return bool(device and device.is_confirmed and
                request.session.get("admin_2fa_verified_at") == str(device.generation))


def mark_admin_mfa_verified(request, device):
    request.session["admin_2fa_verified_at"] = str(device.generation)


def login_limit_key(kind, value):
    return hashlib.sha256(f"{kind}:{value}".encode()).hexdigest()


def _login_key_value(login_value):
    value = login_value.strip()
    return normalize_phone(value) if re.fullmatch(r"[\d\s()+.-]+", value) else value.casefold()


def login_limited(request, login_value):
    ip = getattr(request, "axes_ip_address", None) or request.META.get("REMOTE_ADDR", "")
    checks = (("pair", f"{ip}:{_login_key_value(login_value)}", 5, 30),
              ("ip", ip, 30, 10))
    now = timezone.now()
    for kind, value, limit, minutes in checks:
        row = LoginAttemptWindow.objects.filter(key=login_limit_key(kind, value)).first()
        if row and row.window_started_at > now - timedelta(minutes=minutes) and row.count >= limit:
            return True
    return False


def record_login_failure(request, login_value):
    ip = getattr(request, "axes_ip_address", None) or request.META.get("REMOTE_ADDR", "")
    now = timezone.now()
    LoginAttemptWindow.objects.filter(window_started_at__lt=now - timedelta(days=1)).delete()
    for kind, value, minutes in (("pair", f"{ip}:{_login_key_value(login_value)}", 30),
                                 ("ip", ip, 10)):
        key = login_limit_key(kind, value)
        with transaction.atomic():
            row, _ = LoginAttemptWindow.objects.select_for_update().get_or_create(
                key=key, defaults={"window_started_at": now})
            if row.window_started_at <= now - timedelta(minutes=minutes):
                row.window_started_at = now
                row.count = 0
            row.count += 1
            row.save(update_fields=["count", "window_started_at"])


def clear_login_failures(request, login_value):
    ip = getattr(request, "axes_ip_address", None) or request.META.get("REMOTE_ADDR", "")
    LoginAttemptWindow.objects.filter(
        key=login_limit_key("pair", f"{ip}:{_login_key_value(login_value)}"),
    ).delete()
