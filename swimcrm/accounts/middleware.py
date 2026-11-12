from django.shortcuts import redirect
from django.http import JsonResponse
from django.urls import reverse
from .services import admin_mfa_required, admin_mfa_verified

OTP_SESSION_KEY = "admin_2fa_verified_at"


class AdminOTPMiddleware:
    """Require enrolled administrators to verify TOTP before private admin access."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._needs_otp(request):
            if request.path.startswith(("/api/admin/", "/api/documents/")):
                return JsonResponse({"error": "Требуется код двухфакторной аутентификации.", "code": "mfa_required"}, status=403)
            return redirect(f"{reverse('admin-otp')}?next={request.get_full_path()}")
        return self.get_response(request)

    def _needs_otp(self, request):
        if not request.path.startswith(("/admin/", "/api/admin/", "/api/documents/")):
            return False
        if request.path.startswith("/admin/otp/") or request.path.startswith("/admin/logout/"):
            return False
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if not admin_mfa_required(user):
            return False
        return not admin_mfa_verified(request)
