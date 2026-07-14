from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.middleware.csrf import get_token
from django.http import HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from html import escape

from .middleware import OTP_SESSION_KEY
from .otp import verify_totp


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
        if verify_totp(device.secret, code):
            request.session[OTP_SESSION_KEY] = timezone.now().isoformat()
            device.last_used_at = timezone.now()
            device.save(update_fields=["last_used_at"])
            return redirect(next_url)
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
