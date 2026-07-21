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


def _import_payload(batch):
    return {
        "id": batch.id,
        "created_at": timezone.localtime(batch.created_at).isoformat(),
        "source_name": batch.source_name,
        "rows_total": batch.rows_total,
        "rows_imported": batch.rows_imported,
        "is_rolled_back": batch.is_rolled_back,
        "created_by": str(batch.created_by) if batch.created_by_id else "Система",
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
    return JsonResponse({"entries": [_audit_payload(entry) for entry in qs[:300]]})


@require_GET
def admin_import_batches(request):
    _admin_required(request)
    batches = ImportBatch.objects.select_related("created_by").order_by("-created_at", "-id")[:200]
    return JsonResponse({"batches": [_import_payload(batch) for batch in batches]})


@require_GET
def admin_security_status(request):
    _admin_required(request)
    users = User.objects.order_by("role", "username").only(
        "id", "username", "first_name", "last_name", "email", "role", "is_active", "is_staff")
    otp_by_user = {device.user_id: device for device in AdminOTPDevice.objects.all()}
    return JsonResponse({"users": [{
        "id": user.id,
        "full_name": user.get_full_name() or user.username,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "otp_configured": user.id in otp_by_user,
        "otp_confirmed": bool(otp_by_user.get(user.id) and otp_by_user[user.id].is_confirmed),
    } for user in users]})
