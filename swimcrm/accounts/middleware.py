from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse

OTP_SESSION_KEY = "admin_2fa_verified_at"


class AdminOTPMiddleware:
    """Require TOTP verification before entering Django admin in production."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._needs_otp(request):
            return redirect(f"{reverse('admin-otp')}?next={request.get_full_path()}")
        return self.get_response(request)

    def _needs_otp(self, request):
        if not getattr(settings, "ADMIN_2FA_REQUIRED", False):
            return False
        if not request.path.startswith("/admin/"):
            return False
        if request.path.startswith("/admin/otp/") or request.path.startswith("/admin/logout/"):
            return False
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if not (user.is_staff or user.is_superuser or getattr(user, "role", None) == "admin"):
            return False
        if request.session.get(OTP_SESSION_KEY):
            return False
        return True
