from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from accounts.middleware import OTP_SESSION_KEY
from accounts.models import ParentAccount, Role, User

from .support import _error, _json_body


def _user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "email": user.email,
        "role": "client" if user.role == Role.PARENT else user.role,
        "internal_role": user.role,
        "is_staff": user.is_staff,
    }


def _username_for_login(login_value):
    user = User.objects.filter(Q(username__iexact=login_value) | Q(email__iexact=login_value)).order_by("id").first()
    if user:
        return user.get_username()

    account = (
        ParentAccount.objects.select_related("user")
        .filter(email__iexact=login_value)
        .order_by("id")
        .first()
    )
    return account.user.get_username() if account else login_value


def _profile_allows_login(user):
    if user.role == Role.TRAINER:
        profile = getattr(user, "trainer_profile", None)
        return profile is not None and profile.is_active
    if user.role == Role.PARENT:
        return hasattr(user, "parent_account")
    return True


@require_POST
def auth_login(request):
    try:
        data = _json_body(request)
    except ValidationError as exc:
        return _error(str(exc), status=400)

    login_value = str(data.get("login") or data.get("username") or data.get("email") or "").strip()
    password = str(data.get("password") or "")
    if not login_value or not password:
        return _error("Login and password are required", status=400)

    username = _username_for_login(login_value)
    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active or not _profile_allows_login(user):
        return _error("Invalid login or password", status=400)

    login(request, user)
    request.session.pop(OTP_SESSION_KEY, None)
    return JsonResponse({"ok": True, "user": _user_payload(user)})


@require_POST
def auth_logout(request):
    logout(request)
    return JsonResponse({"ok": True})


__all__ = [name for name in globals() if not name.startswith("__")]
