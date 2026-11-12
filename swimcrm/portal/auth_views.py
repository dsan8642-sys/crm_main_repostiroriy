import hashlib
import re
import secrets
from datetime import timedelta

from axes.utils import reset as reset_axes_attempts
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from accounts.middleware import OTP_SESSION_KEY
from accounts.models import AccessPurpose, AccountActivation, ParentAccount, Role, Trainer, User, AdminOTPDevice, normalize_phone
from accounts.services import admin_mfa_required, admin_mfa_verified, mark_admin_mfa_verified, login_limited, record_login_failure, clear_login_failures
from accounts.otp import generate_totp_secret, matching_totp_counter, provisioning_uri
from axes.handlers.proxy import AxesProxyHandler
from uuid import uuid4
from audit.models import audit

from .admin_support import _admin_required
from .support import _error, _invalidate_access_codes, _json_body


def _user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "email": user.email,
        "role": "client" if user.role == Role.PARENT else user.role,
        "internal_role": user.role,
        "is_staff": user.is_staff,
        "can_manage_administrators": user.is_superuser,
    }


def _username_for_login(login_value):
    username_matches = list(User.objects.filter(
        username__iexact=login_value
    ).values_list("id", "username"))
    exact_username_matches = [
        username for _, username in username_matches if username == login_value
    ]
    if len(exact_username_matches) == 1:
        return exact_username_matches[0]

    user_ids = {user_id for user_id, _ in username_matches}
    user_ids.update(User.objects.filter(
        email__iexact=login_value
    ).values_list("id", flat=True))
    user_ids.update(ParentAccount.objects.filter(
        email__iexact=login_value).values_list("user_id", flat=True))
    if re.fullmatch(r"[\d\s()+.-]+", login_value):
        phone_login = normalize_phone(login_value)
        if phone_login:
            user_ids.update(User.objects.filter(
                username__iexact=phone_login).values_list("id", flat=True))
            user_ids.update(ParentAccount.objects.filter(
                phone_normalized=phone_login).values_list("user_id", flat=True))
    if len(user_ids) != 1:
        return None
    return User.objects.only("username").get(pk=user_ids.pop()).get_username()


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
    if len(login_value) > 254 or len(password) > 1024:
        raise ValidationError("Неверный логин или пароль.", code="invalid_credentials")
    if login_limited(request, login_value):
        return JsonResponse({"error": "Слишком много попыток. Попробуйте позже.", "code": "rate_limited"}, status=429)
    if not login_value or not password:
        errors = {}
        if not login_value:
            errors["login"] = ValidationError(
                "Укажите логин, email или телефон.", code="required")
        if not password:
            errors["password"] = ValidationError(
                "Укажите пароль.", code="required")
        raise ValidationError(errors)

    username = _username_for_login(login_value)
    user = authenticate(request, username=username, password=password) if username else None
    if user is None or not user.is_active or not _profile_allows_login(user):
        record_login_failure(request, login_value)
        raise ValidationError(
            "Неверный логин или пароль.", code="invalid_credentials")

    offer_mfa_setup = bool(
        user.role == Role.ADMIN and user.last_login is None
        and AccountActivation.objects.filter(
            user=user, purpose=AccessPurpose.ADMIN_INVITE, used_at__isnull=False,
        ).exists()
        and not admin_mfa_required(user)
    )
    login(request, user)
    clear_login_failures(request, login_value)
    request.session.pop(OTP_SESSION_KEY, None)
    return JsonResponse({"ok": True, "user": _user_payload(user),
                         "mfa_required": admin_mfa_required(user),
                         "offer_mfa_setup": offer_mfa_setup})


@require_POST
def auth_logout(request):
    logout(request)
    return JsonResponse({"ok": True})


def _issue_access_code(user, actor, *, parent=None, purpose=None):
    if user.role not in {Role.PARENT, Role.TRAINER}:
        raise ValidationError("portal access is available only for clients and trainers")
    now = timezone.now()
    AccountActivation.objects.filter(user=user, used_at__isnull=True).update(used_at=now)
    if parent is not None:
        AccountActivation.objects.filter(
            parent=parent, user__isnull=True, used_at__isnull=True).update(used_at=now)
    raw_code = secrets.token_urlsafe(32)
    purpose = purpose or (
        AccessPurpose.RECOVERY if user.has_usable_password() else AccessPurpose.ACTIVATION)
    activation = AccountActivation.objects.create(
        parent=parent,
        user=user,
        purpose=purpose,
        token_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
        expires_at=now + timedelta(hours=72),
        created_by=actor,
    )
    audit(actor, "portal_access.code_issued", user, {
        "purpose": purpose,
        "role": user.role,
        "expires_at": activation.expires_at.isoformat(),
    })
    return {
        "login": user.get_username(),
        "activation_code": raw_code,
        # Compatibility for the pre-Prompt-05 client activation consumer.
        "activation_token": raw_code,
        "expires_at": activation.expires_at.isoformat(),
        "purpose": purpose,
    }


def _client_access_target(client_id):
    account = ParentAccount.objects.select_related("user").filter(pk=client_id).first()
    return account, account.user if account else None


def _trainer_access_target(trainer_id):
    trainer = Trainer.objects.select_related("user").filter(pk=trainer_id).first()
    return trainer, trainer.user if trainer else None


def _admin_issue_access(request, target, user, *, parent=None):
    actor = _admin_required(request)
    if target is None:
        return _error("Portal profile not found", status=404)
    if not user.is_active:
        return _error("Portal access is revoked; use restore access", status=400)
    return JsonResponse(_issue_access_code(user, actor, parent=parent), status=201)


def _admin_revoke_access(request, target, user):
    actor = _admin_required(request)
    if target is None:
        return _error("Portal profile not found", status=404)
    with transaction.atomic():
        user.is_active = False
        user.save(update_fields=["is_active"])
        invalidated = _invalidate_access_codes(user)
        audit(actor, "portal_access.revoked", user, {
            "role": user.role,
            "invalidated_codes": invalidated,
        })
    return JsonResponse({"ok": True, "portal_access": "revoked"})


def _admin_restore_access(request, target, user, *, parent=None):
    actor = _admin_required(request)
    if target is None:
        return _error("Portal profile not found", status=404)
    if user.role == Role.TRAINER and not target.is_active:
        return _error("Restore the trainer profile before restoring portal access", status=400)
    with transaction.atomic():
        user.is_active = True
        user.save(update_fields=["is_active"])
        payload = _issue_access_code(
            user, actor, parent=parent, purpose=AccessPurpose.RECOVERY)
        audit(actor, "portal_access.restored", user, {"role": user.role})
    return JsonResponse(payload, status=201)


@require_POST
def admin_client_access_issue(request, client_id):
    account, user = _client_access_target(client_id)
    return _admin_issue_access(request, account, user, parent=account)


@require_POST
def admin_client_access_revoke(request, client_id):
    account, user = _client_access_target(client_id)
    return _admin_revoke_access(request, account, user)


@require_POST
def admin_client_access_restore(request, client_id):
    account, user = _client_access_target(client_id)
    return _admin_restore_access(request, account, user, parent=account)


@require_POST
def admin_trainer_access_issue(request, trainer_id):
    trainer, user = _trainer_access_target(trainer_id)
    return _admin_issue_access(request, trainer, user)


@require_POST
def admin_trainer_access_revoke(request, trainer_id):
    trainer, user = _trainer_access_target(trainer_id)
    return _admin_revoke_access(request, trainer, user)


@require_POST
def admin_trainer_access_restore(request, trainer_id):
    trainer, user = _trainer_access_target(trainer_id)
    return _admin_restore_access(request, trainer, user)


@require_POST
def admin_create_client_activation(request, client_id):
    return admin_client_access_issue(request, client_id)


@require_POST
def auth_activate(request):
    try:
        data = _json_body(request)
    except ValidationError:
        raise
    token = str(data.get("activation_token") or data.get("token") or "").strip()
    password = str(data.get("password") or "")
    if not token or not password:
        errors = {}
        if not token:
            errors["activation_token"] = ValidationError(
                "Укажите одноразовый код доступа.", code="required")
        if not password:
            errors["password"] = ValidationError(
                "Укажите новый пароль.", code="required")
        raise ValidationError(errors)

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with transaction.atomic():
        activation = (
            AccountActivation.objects.select_for_update(of=("self",))
            .select_related("user", "parent__user")
            .filter(token_hash=token_hash)
            .first()
        )
        if activation is None or not activation.is_valid:
            raise ValidationError({
                "activation_token": ValidationError(
                    "Код доступа недействителен или истёк.",
                    code="invalid",
                ),
            })
        user = activation.user or (activation.parent.user if activation.parent_id else None)
        if user and activation.purpose == AccessPurpose.ADMIN_INVITE:
            user = User.objects.select_for_update().get(pk=user.pk)
        is_admin_invite = bool(
            user and user.role == Role.ADMIN and activation.purpose == AccessPurpose.ADMIN_INVITE
            and not user.is_active and not user.has_usable_password()
        )
        if user is None or (user.role not in {Role.PARENT, Role.TRAINER} and not is_admin_invite):
            raise ValidationError({
                "activation_token": ValidationError(
                    "Код доступа недействителен или истёк.",
                    code="invalid",
                ),
            })
        if (not user.is_active and not is_admin_invite) or (not is_admin_invite and not _profile_allows_login(user)):
            raise ValidationError(
                "Доступ к порталу недоступен.", code="unavailable")
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise ValidationError({"password": exc}) from exc
        user.set_password(password)
        if is_admin_invite:
            user.is_active = True
        user.save(update_fields=["password", "is_active"] if is_admin_invite else ["password"])
        reset_axes_attempts(username=user.get_username())
        clear_login_failures(request, user.get_username())
        activation.used_at = timezone.now()
        activation.save(update_fields=["used_at"])
        audit(None, "portal_access.code_used", user, {
            "purpose": activation.purpose,
            "role": user.role,
        })
    return JsonResponse({"ok": True, "login": user.get_username()})


def _admin_mfa_user(request):
    user = request.user
    if not user.is_authenticated or (user.role != Role.ADMIN and not user.is_superuser and not user.is_staff):
        raise PermissionDenied("Требуется вход администратора.")
    return user


@require_GET
def auth_mfa_status(request):
    user = _admin_mfa_user(request)
    device = AdminOTPDevice.objects.filter(user=user).first()
    return JsonResponse({"required": admin_mfa_required(user),
                         "verified": admin_mfa_verified(request),
                         "configured": bool(device and device.is_confirmed)})


@require_POST
def auth_mfa_setup(request):
    user = _admin_mfa_user(request)
    limit_identity = f"mfa-setup:{user.pk}"
    if login_limited(request, limit_identity):
        return JsonResponse({"error": "Слишком много попыток. Попробуйте позже.", "code": "rate_limited"}, status=429)
    data = _json_body(request)
    if not user.check_password(str(data.get("current_password") or "")):
        record_login_failure(request, limit_identity)
        raise ValidationError({"current_password": ValidationError("Неверный пароль.", code="invalid")})
    clear_login_failures(request, limit_identity)
    device, _ = AdminOTPDevice.objects.get_or_create(user=user, defaults={"secret": generate_totp_secret()})
    if device.is_confirmed:
        raise ValidationError("2FA уже настроена.", code="already_configured")
    device.secret = generate_totp_secret()
    device.generation = uuid4()
    device.save(update_fields=["secret", "generation"])
    audit(user, "admin.mfa.setup_started", user, {})
    response = JsonResponse({"secret": device.secret,
                             "uri": provisioning_uri(secret=device.secret, username=user.username)})
    response["Cache-Control"] = "private, no-store"
    return response


@require_POST
def auth_mfa_verify(request):
    user = _admin_mfa_user(request)
    data = _json_body(request)
    code = str(data.get("code") or "")
    credentials = {"username": f"admin-otp:{user.pk}"}
    if AxesProxyHandler.is_locked(request, credentials):
        return JsonResponse({"error": "Слишком много попыток. Попробуйте позже.", "code": "rate_limited"}, status=429)
    with transaction.atomic():
        device = AdminOTPDevice.objects.select_for_update().filter(user=user).first()
        if device is None:
            raise ValidationError("2FA не настроена.", code="not_configured")
        counter = matching_totp_counter(device.secret, code, after_counter=device.last_used_counter)
        if counter is not None:
            device.last_used_counter = counter
            device.last_used_at = timezone.now()
            if not device.is_confirmed:
                device.is_confirmed = True
                device.confirmed_at = device.last_used_at
                device.enforced = True
                device.generation = uuid4()
            device.save(update_fields=["last_used_counter", "last_used_at", "is_confirmed", "confirmed_at", "enforced", "generation"])
    if counter is None:
        AxesProxyHandler.user_login_failed(sender=auth_mfa_verify, credentials=credentials, request=request)
        raise ValidationError({"code": ValidationError("Неверный код.", code="invalid")})
    mark_admin_mfa_verified(request, device)
    AxesProxyHandler.reset_attempts(username=credentials["username"], ip_address=request.axes_ip_address)
    audit(user, "admin.mfa.verified", user, {"enforced": device.enforced})
    return JsonResponse({"ok": True, "user": _user_payload(user)})


__all__ = [name for name in globals() if not name.startswith("__")]
