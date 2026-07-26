"""HTTP layer for server-owned client, attendance, and payment imports."""
import json
from dataclasses import asdict
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods, require_POST

from audit.models import audit
from dataio import attendance_importer, payments_importer
from dataio import importer as clients_importer
from dataio.models import (
    ImportBatch, ImportBatchStatus, ImportEffectMode, ImportKind,
)

from .admin_support import _admin_required
from .support import _json_body


PREVIEW_TTL = timedelta(minutes=30)
COMMIT_FIELDS = {"batch_id", "selected_indices"}
ATTENDANCE_COMMIT_FIELDS = COMMIT_FIELDS | {"confirm_financial_effects"}
PAYMENTS_COMMIT_FIELDS = COMMIT_FIELDS | {"approve_possible_duplicates"}


def _uploaded_file(request):
    file = request.FILES.get("file")
    if file is None:
        raise ValidationError("Файл не передан")
    if file.size > clients_importer.MAX_IMPORT_BYTES:
        raise ValidationError("Файл импорта превышает лимит 5 МБ")
    return file


def _create_preview_batch(
        *, actor, kind, source_name, headers, source_rows, preview_rows, mapping=None,
        effect_mode=ImportEffectMode.NOT_APPLICABLE):
    now = timezone.now()
    ImportBatch.objects.filter(
        status=ImportBatchStatus.PREVIEWED,
        preview_expires_at__lte=now,
    ).delete()
    batch = ImportBatch.objects.create(
        created_by=actor,
        source_name=str(source_name or "")[:255],
        kind=kind,
        effect_mode=effect_mode,
        status=ImportBatchStatus.PREVIEWED,
        input_data={
            "headers": headers,
            "rows": source_rows,
            "mapping": mapping or {},
        },
        preview_expires_at=now + PREVIEW_TTL,
        rows_total=len(preview_rows),
    )
    return JsonResponse({
        "batch_id": batch.id,
        "expires_at": timezone.localtime(batch.preview_expires_at).isoformat(),
        "effect_mode": batch.effect_mode,
        "headers": headers,
        "rows": [asdict(row) for row in preview_rows],
    })


def _commit_data(request, *, allowed_fields=COMMIT_FIELDS):
    data = _json_body(request)
    unexpected = set(data) - allowed_fields
    if unexpected:
        raise ValidationError(
            f"Недопустимые поля commit: {', '.join(sorted(unexpected))}")
    try:
        batch_id = int(data.get("batch_id"))
    except (TypeError, ValueError):
        raise ValidationError("Некорректный batch_id")
    selected_indices = data.get("selected_indices")
    if not isinstance(selected_indices, list) or not selected_indices:
        raise ValidationError("Не выбраны строки для импорта")
    if any(isinstance(index, bool) or not isinstance(index, int) for index in selected_indices):
        raise ValidationError("selected_indices должен содержать номера строк")
    if len(selected_indices) != len(set(selected_indices)):
        raise ValidationError("selected_indices содержит повторяющиеся номера")
    return batch_id, set(selected_indices), data


def _locked_preview_batch(*, batch_id, actor, kind):
    batch = ImportBatch.objects.select_for_update().filter(
        pk=batch_id,
        created_by=actor,
        kind=kind,
    ).first()
    if batch is None:
        raise ValidationError("Import batch не найден")
    if batch.status != ImportBatchStatus.PREVIEWED:
        raise ValidationError("Import batch уже применён или недоступен")
    if not batch.preview_expires_at or batch.preview_expires_at <= timezone.now():
        raise ValidationError("Срок действия import batch истёк; выполните preview заново")
    payload = batch.input_data
    if not isinstance(payload, dict):
        raise ValidationError("Import batch повреждён")
    headers = payload.get("headers")
    rows = payload.get("rows")
    if not isinstance(headers, list) or not isinstance(rows, list):
        raise ValidationError("Import batch повреждён")
    return batch, headers, rows, payload.get("mapping") or {}


def _selected_rows(preview_rows, selected_indices):
    available = {row.index for row in preview_rows}
    unknown = selected_indices - available
    if unknown:
        raise ValidationError(
            f"В batch отсутствуют строки: {', '.join(map(str, sorted(unknown)))}")
    return [row for row in preview_rows if row.index in selected_indices]


def _complete_batch(batch, summary, rows_imported):
    batch.status = ImportBatchStatus.COMMITTED
    batch.committed_at = timezone.now()
    batch.preview_expires_at = None
    batch.input_data = {}
    batch.result = summary
    batch.rows_imported = rows_imported
    batch.save(update_fields=[
        "status", "committed_at", "preview_expires_at", "input_data",
        "result", "rows_imported",
    ])


# ---------------------------------------------------------------- clients ---

@require_POST
def admin_import_clients_preview(request):
    actor = _admin_required(request)
    file = _uploaded_file(request)
    try:
        mapping = json.loads(request.POST.get("mapping") or "{}")
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid mapping JSON: {exc}") from exc
    if not isinstance(mapping, dict):
        raise ValidationError("mapping должен быть объектом")
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = clients_importer.preview(headers, rows, mapping)
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.CLIENTS,
        source_name=file.name,
        headers=headers,
        source_rows=rows,
        preview_rows=preview_rows,
        mapping=mapping,
    )


@require_POST
@transaction.atomic
def admin_import_clients_commit(request):
    actor = _admin_required(request)
    batch_id, selected_indices, _data = _commit_data(request)
    batch, headers, rows, mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=ImportKind.CLIENTS)
    preview_rows = clients_importer.preview(headers, rows, mapping)
    selected_rows = _selected_rows(preview_rows, selected_indices)
    batch = clients_importer.commit(
        selected_rows,
        actor=actor,
        source_name=batch.source_name,
        batch=batch,
    )
    return JsonResponse({
        "batch_id": batch.id,
        "rows_total": batch.rows_total,
        "rows_imported": batch.rows_imported,
    }, status=201)


@require_http_methods(["GET", "POST"])
@transaction.atomic
def admin_import_clients_rollback(request, batch_id):
    actor = _admin_required(request)
    batch = ImportBatch.objects.select_for_update().filter(
        pk=batch_id,
        kind=ImportKind.CLIENTS,
        status=ImportBatchStatus.COMMITTED,
        created_by=actor,
    ).first()
    if batch is None:
        raise ValidationError("Импорт не найден")
    preview = clients_importer.rollback_preview(batch)
    if request.method == "GET":
        return JsonResponse(preview)
    data = _json_body(request)
    if set(data) - {"confirm_batch_id", "confirm_rollback"}:
        raise ValidationError("Недопустимые поля rollback")
    if data.get("confirm_rollback") is not True or str(data.get("confirm_batch_id")) != str(batch.id):
        raise ValidationError("Подтвердите откат точным ID import batch")
    if not preview["can_rollback"]:
        raise ValidationError("Откат заблокирован зависимыми данными")
    clients_importer.rollback(batch)
    audit(actor, "clients.import_rolled_back", batch, preview["will_delete"])
    return JsonResponse({"ok": True, "batch_id": batch.id})


# ------------------------------------------------------------- attendance ---

@require_POST
def admin_import_attendance_preview(request):
    actor = _admin_required(request)
    file = _uploaded_file(request)
    effect_mode = request.POST.get("effect_mode") or ImportEffectMode.HISTORY_ONLY
    if effect_mode not in (ImportEffectMode.HISTORY_ONLY, ImportEffectMode.APPLY_FINANCIAL):
        raise ValidationError("Некорректный режим импорта посещаемости")
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = attendance_importer.preview(headers, rows)
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.ATTENDANCE,
        source_name=file.name,
        headers=headers,
        source_rows=rows,
        preview_rows=preview_rows,
        effect_mode=effect_mode,
    )


@require_POST
@transaction.atomic
def admin_import_attendance_commit(request):
    actor = _admin_required(request)
    batch_id, selected_indices, data = _commit_data(
        request, allowed_fields=ATTENDANCE_COMMIT_FIELDS)
    batch, headers, rows, _mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=ImportKind.ATTENDANCE)
    if batch.effect_mode == ImportEffectMode.APPLY_FINANCIAL:
        if data.get("confirm_financial_effects") is not True:
            raise ValidationError(
                "Подтвердите применение финансовых последствий исторического импорта")
    elif data.get("confirm_financial_effects") is True:
        raise ValidationError(
            "Финансовое подтверждение не соответствует безопасному import batch")
    preview_rows = attendance_importer.preview(headers, rows)
    selected_rows = _selected_rows(preview_rows, selected_indices)
    summary = attendance_importer.commit(
        selected_rows, actor=actor, mode=batch.effect_mode)
    _complete_batch(batch, summary, summary["created_records"])
    audit(actor, "attendance.import_committed", batch, {
        "effect_mode": batch.effect_mode,
        "financial_effects_applied": summary["financial_effects_applied"],
        "rows_imported": summary["created_records"],
    })
    return JsonResponse({"batch_id": batch.id, **summary}, status=201)


# --------------------------------------------------------------- payments ---

@require_POST
def admin_import_payments_preview(request):
    actor = _admin_required(request)
    file = _uploaded_file(request)
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = payments_importer.preview(headers, rows)
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.PAYMENTS,
        source_name=file.name,
        headers=headers,
        source_rows=rows,
        preview_rows=preview_rows,
    )


@require_POST
@transaction.atomic
def admin_import_payments_commit(request):
    actor = _admin_required(request)
    batch_id, selected_indices, data = _commit_data(
        request, allowed_fields=PAYMENTS_COMMIT_FIELDS)
    batch, headers, rows, _mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=ImportKind.PAYMENTS)
    preview_rows = payments_importer.preview(headers, rows)
    selected_rows = _selected_rows(preview_rows, selected_indices)
    summary = payments_importer.commit(
        selected_rows,
        actor=actor,
        approve_possible_duplicates=data.get("approve_possible_duplicates") is True,
    )
    _complete_batch(batch, summary, summary["created"])
    audit(actor, "payments.import_committed", batch, {
        "rows_imported": summary["created"],
        "possible_duplicates_approved": data.get("approve_possible_duplicates") is True,
    })
    return JsonResponse({"batch_id": batch.id, **summary}, status=201)


__all__ = [name for name in globals() if not name.startswith("__")]
