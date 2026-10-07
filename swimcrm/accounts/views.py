from django.contrib.auth.decorators import login_required
from axes.handlers.proxy import AxesProxyHandler
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.middleware.csrf import get_token
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from html import escape

from .middleware import OTP_SESSION_KEY
from .models import AdminOTPDevice
from .otp import matching_totp_counter


@login_required
@require_http_methods(["GET", "POST"])
def admin_otp(request):
    user = request.user
    if not (user.is_staff or user.is_superuser or user.role == "admin"):
        raise PermissionDenied("2FA доступна только администраторам")

    next_url = _safe_next_url(request)
    device = getattr(user, "admin_otp_device", None)
    if device is None or not device.is_confirmed:
        return HttpResponse(
            "2FA для администратора не настроена. Выполните команду setup_admin_otp.",
            status=403,
        )

    if request.method == "POST":
        code = request.POST.get("code", "")
        credentials = {"username": f"admin-otp:{user.pk}"}
        if AxesProxyHandler.is_locked(request, credentials):
            return HttpResponse(
                _otp_form(request, next_url, error="Слишком много попыток. Попробуйте позже."),
                status=429,
            )

        with transaction.atomic():
            device = AdminOTPDevice.objects.select_for_update().get(pk=device.pk)
            counter = matching_totp_counter(
                device.secret, code, after_counter=device.last_used_counter
            )
            if counter is not None:
                now = timezone.now()
                device.last_used_at = now
                device.last_used_counter = counter
                device.save(update_fields=["last_used_at", "last_used_counter"])

        if counter is not None:
            request.session[OTP_SESSION_KEY] = timezone.now().isoformat()
            AxesProxyHandler.reset_attempts(
                username=credentials["username"], ip_address=request.axes_ip_address
            )
            return redirect(next_url)

        request.POST = request.POST.copy()
        request.POST["code"] = "[REDACTED]"
        AxesProxyHandler.user_login_failed(
            sender=admin_otp, credentials=credentials, request=request
        )
        if request.axes_locked_out:
            return HttpResponse(
                _otp_form(request, next_url, error="Слишком много попыток. Попробуйте позже."),
                status=429,
            )
        return HttpResponse(_otp_form(request, next_url, error="Неверный код"), status=400)

    return HttpResponse(_otp_form(request, next_url))


def _safe_next_url(request):
    next_url = request.GET.get("next") or request.POST.get("next") or reverse("admin:index")
    if url_has_allowed_host_and_scheme(
        url=next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return next_url
    return reverse("admin:index")


def _otp_form(request, next_url, error=""):
    err = f"<p>{escape(error)}</p>" if error else ""
    csrf_token = get_token(request)
    safe_next = escape(next_url, quote=True)
    return f"""
    <!doctype html>
    <meta charset="utf-8">
    <title>Admin 2FA</title>
    <h1>Код администратора</h1>
    {err}
    <form method="post">
      <input type="hidden" name="csrfmiddlewaretoken" value="{csrf_token}">
      <input type="hidden" name="next" value="{safe_next}">
      <input name="code" inputmode="numeric" autocomplete="one-time-code" autofocus>
      <button type="submit">Подтвердить</button>
    </form>
    """
