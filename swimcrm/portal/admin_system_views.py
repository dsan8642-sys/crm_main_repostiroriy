from django.contrib.auth import password_validation, update_session_auth_hash
from django.core.exceptions import ValidationError
from django.db import transaction

from audit.models import AuditLogEntry
from accounts.models import AdminOTPDevice, Role, User
from dataio.models import ImportBatch

from .support import *
from .admin_support import _admin_required


def _audit_payload(entry):
    return {
        "id": entry.id,
        "created_at": timezone.localtime(entry.created_at).isoformat(),
        "actor": str(entry.actor) if entry.actor_id else "Система",
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "changes": entry.changes,
    }


def _import_payload(batch, actor):
    result = batch.result if isinstance(batch.result, dict) else {}
    return {
        "id": batch.id,
        "created_at": timezone.localtime(batch.created_at).isoformat(),
        "source_name": batch.source_name,
        "kind": batch.kind,
        "effect_mode": batch.effect_mode,
        "status": batch.status,
        "rows_total": batch.rows_total,
        "rows_imported": batch.rows_imported,
        "is_rolled_back": batch.is_rolled_back,
        "created_by": str(batch.created_by) if batch.created_by_id else "Система",
        "import_mode": result.get("import_mode", "create_only"),
        "rollback_strategy": result.get("rollback_strategy"),
        "report_available": bool(result.get("report_rows")) and batch.created_by_id == actor.id,
        "created": result.get("created", result.get("created_records", batch.rows_imported)),
        "updated": result.get("updated", 0),
        "skipped": result.get("skipped", max(batch.rows_total - batch.rows_imported, 0)),
        "errors_count": len(result.get("errors") or []),
    }


@require_GET
def admin_audit_log(request):
    _admin_required(request)
    qs = AuditLogEntry.objects.select_related("actor").order_by("-created_at", "-id")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(
            Q(action__icontains=q) | Q(entity_type__icontains=q) | Q(entity_id__icontains=q) |
            Q(actor__username__icontains=q) | Q(actor__first_name__icontains=q) | Q(actor__last_name__icontains=q))
    if request.GET.get("entity_type"):
        qs = qs.filter(entity_type=request.GET["entity_type"])
    return JsonResponse({"entries": [_audit_payload(entry) for entry in qs[:MAX_LIST_ROWS]]})


@require_GET
def admin_import_batches(request):
    actor = _admin_required(request)
    batches = ImportBatch.objects.select_related("created_by").order_by("-created_at", "-id")[:200]
    return JsonResponse({"batches": [_import_payload(batch, actor) for batch in batches]})


@require_GET
def admin_security_status(request):
    _admin_required(request)
    users = User.objects.order_by("role", "username").only(
        "id", "username", "first_name", "last_name", "email", "role", "is_active", "is_staff", "is_superuser")
    otp_by_user = {device.user_id: device for device in AdminOTPDevice.objects.all()}
    return JsonResponse({"users": [{
        "id": user.id,
        "full_name": user.get_full_name() or user.username,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "otp_configured": user.id in otp_by_user,
        "otp_confirmed": bool(otp_by_user.get(user.id) and otp_by_user[user.id].is_confirmed),
    } for user in users]})


def _require_current_admin_password(actor, data):
    current_password = str(data.get("current_password") or "")
    if not current_password or not actor.check_password(current_password):
        raise ValidationError({"current_password": ValidationError(
            "Текущий пароль указан неверно.", code="invalid")})


def _primary_admin_required(request):
    actor = _admin_required(request)
    if not actor.is_superuser:
        raise PermissionDenied("Только главный администратор может управлять доступом администраторов.")
    return actor


@require_POST
@transaction.atomic
def admin_administrator_create(request):
    actor = _primary_admin_required(request)
    data = _json_body(request)
    _require_current_admin_password(actor, data)
    full_name = " ".join(str(data.get("full_name") or "").split())
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    email = str(data.get("email") or "").strip()
    if not full_name:
        raise ValidationError({"full_name": ValidationError("Укажите имя администратора.", code="required")})
    if not username:
        raise ValidationError({"username": ValidationError("Укажите логин.", code="required")})
    try:
        User._meta.get_field("username").run_validators(username)
    except ValidationError as exc:
        raise ValidationError({"username": exc}) from exc
    try:
        if email:
            User._meta.get_field("email").run_validators(email)
    except ValidationError as exc:
        raise ValidationError({"email": exc}) from exc
    try:
        password_validation.validate_password(password)
    except ValidationError as exc:
        raise ValidationError({"password": exc}) from exc
    if User.objects.filter(username__iexact=username).exists():
        raise ValidationError({"username": ValidationError("Этот логин уже используется.", code="duplicate")})
    first_name, *rest = full_name.split(" ", 1)
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name,
        last_name=rest[0] if rest else "",
        role=Role.ADMIN,
    )
    audit(actor, "admin.access.created", user, {"username": user.username, "full_name": full_name})
    return JsonResponse({"id": user.id, "username": user.username, "full_name": user.get_full_name()}, status=201)


@require_POST
@transaction.atomic
def admin_administrator_access(request, user_id, action):
    actor = _primary_admin_required(request)
    data = _json_body(request)
    _require_current_admin_password(actor, data)
    if action not in {"revoke", "restore"}:
        raise ValidationError({"action": ValidationError("Неизвестное действие.", code="invalid")})
    user = get_object_or_404(User, pk=user_id, role=Role.ADMIN)
    if user.pk == actor.pk:
        raise ValidationError({"user": ValidationError("Нельзя отозвать собственный доступ.", code="self")})
    if user.is_superuser:
        raise ValidationError({"user": ValidationError("Доступ главного администратора нельзя изменить здесь.", code="protected")})
    is_active = action == "restore"
    changed = user.is_active != is_active
    if changed:
        user.is_active = is_active
        user.save(update_fields=["is_active"])
        audit(actor, f"admin.access.{action}d", user, {"username": user.username})
    return JsonResponse({"id": user.id, "is_active": user.is_active, "changed": changed})


@require_http_methods(["GET", "PATCH"])
def admin_credentials(request):
    authenticated_user = _admin_required(request)
    user = User.objects.get(pk=authenticated_user.pk)
    if request.method == "GET":
        return JsonResponse({
            "username": user.username,
            "email": user.email,
            "role": user.role,
        })

    data = _json_body(request)
    current_password = str(data.get("current_password") or "")
    if not current_password or not user.check_password(current_password):
        raise ValidationError({
            "current_password": ValidationError(
                "Текущий пароль указан неверно.", code="invalid",
            ),
        })

    old_username = user.username
    new_username = str(data.get("username") or old_username).strip()
    new_password = str(data.get("new_password") or "")
    if not new_username:
        raise ValidationError({
            "username": ValidationError("Укажите логин.", code="required"),
        })
    try:
        User._meta.get_field("username").run_validators(new_username)
    except ValidationError as exc:
        raise ValidationError({"username": exc}) from exc
    if User.objects.exclude(pk=user.pk).filter(username__iexact=new_username).exists():
        raise ValidationError({
            "username": ValidationError(
                "Этот логин уже используется.", code="duplicate",
            ),
        })
    if new_username == old_username and not new_password:
        raise ValidationError({
            "username": ValidationError(
                "Измените логин или укажите новый пароль.", code="no_changes",
            ),
        })

    password_changed = bool(new_password)
    with transaction.atomic():
        user.username = new_username
        if password_changed:
            try:
                password_validation.validate_password(new_password, user=user)
            except ValidationError as exc:
                raise ValidationError({"new_password": exc}) from exc
            user.set_password(new_password)
        user.save(update_fields=["username", "password"] if password_changed else ["username"])
        audit(user, "admin.credentials.updated", user, {
            "username_changed": new_username != old_username,
            "password_changed": password_changed,
        })
    if password_changed:
        update_session_auth_hash(request, user)
    return JsonResponse({
        "ok": True,
        "username": user.username,
        "role": user.role,
    })
