import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.middleware import OTP_SESSION_KEY
from accounts.models import AccountActivation, ParentAccount, Role, User

from .admin_support import _admin_required
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


@require_POST
def admin_create_client_activation(request, client_id):
    actor = _admin_required(request)
    account = ParentAccount.objects.select_related("user").filter(pk=client_id).first()
    if account is None:
        return _error("Client not found", status=404)
    if not account.user.is_active:
        return _error("Archived client access cannot be activated", status=400)
    AccountActivation.objects.filter(parent=account, used_at__isnull=True).update(used_at=timezone.now())
    token = secrets.token_urlsafe(32)
    activation = AccountActivation.objects.create(
        parent=account,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=timezone.now() + timedelta(hours=72),
        created_by=actor,
    )
    return JsonResponse({
        "client_id": account.id,
        "activation_token": token,
        "expires_at": activation.expires_at.isoformat(),
    }, status=201)


@require_POST
def auth_activate(request):
    try:
        data = _json_body(request)
        client_id = int(data.get("client_id"))
    except (ValidationError, TypeError, ValueError):
        return _error("Client, activation code and password are required", status=400)
    token = str(data.get("activation_token") or data.get("token") or "").strip()
    password = str(data.get("password") or "")
    if not token or not password:
        return _error("Client, activation code and password are required", status=400)

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with transaction.atomic():
        activation = (
            AccountActivation.objects.select_for_update()
            .select_related("parent__user")
            .filter(parent_id=client_id, token_hash=token_hash)
            .first()
        )
        if activation is None or not activation.is_valid:
            return _error("Activation code is invalid or expired", status=400)
        user = activation.parent.user
        if not user.is_active:
            return _error("Client account is archived", status=400)
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return _error(list(exc.messages), status=400)
        user.set_password(password)
        user.save(update_fields=["password"])
        activation.used_at = timezone.now()
        activation.save(update_fields=["used_at"])
    return JsonResponse({"ok": True, "login": activation.parent.email or user.username})


__all__ = [name for name in globals() if not name.startswith("__")]
