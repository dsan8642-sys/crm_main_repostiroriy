"""HTTP layer for server-owned client, attendance, and payment imports."""
import json
import re
from dataclasses import asdict
from datetime import timedelta
from hashlib import sha256

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from audit.models import audit
from analytics.exporters import rows_to_csv, rows_to_xlsx
from dataio import attendance_importer, payments_importer, reference_importer
from dataio import importer as clients_importer
from dataio.contracts import (
    CONTRACTS, contract_payload, field_options, prepare_rows, stable_row_key,
)
from dataio.matching import normalize_phone
from dataio.models import (
    ImportBatch, ImportBatchStatus, ImportEffectMode, ImportKind,
)

from .admin_support import _admin_required
from .support import _field_validation_error, _json_body
from students.models import Student


PREVIEW_TTL = timedelta(minutes=30)
COMMIT_FIELDS = {"batch_id", "selected_indices"}
ATTENDANCE_COMMIT_FIELDS = COMMIT_FIELDS | {"confirm_financial_effects"}
PAYMENTS_COMMIT_FIELDS = COMMIT_FIELDS | {"approve_possible_duplicates"}

ROLLBACK_STRATEGIES = {
    ImportKind.CLIENTS: {
        "kind": "safe_delete_created",
        "label": "Доступен безопасный откат созданных этим batch записей, пока нет последующих зависимостей.",
    },
    ImportKind.PAYMENTS: {
        "kind": "compensating_only",
        "label": "Платёжный журнал неизменяем: автоматическое удаление запрещено; исправление выполняется новой аудируемой операцией через бизнес-логику оплат.",
    },
    ImportKind.ATTENDANCE: {
        "kind": "compensating_only",
        "label": "История посещений неизменяема: исправление выполняется обычной аудируемой сменой статуса; финансовый режим требует отдельной сверки.",
    },
    ImportKind.GROUPS: {
        "kind": "safe_restore",
        "label": "Доступен откат созданных групп и восстановление предыдущих значений, пока записи не менялись и не получили зависимости.",
    },
    ImportKind.TRAINERS: {
        "kind": "manual_safe_cleanup",
        "label": "Автооткат не удаляет учётные записи: созданные ID перечислены в отчёте и деактивируются или удаляются вручную после проверки зависимостей.",
    },
}


IMPORTERS = {
    ImportKind.CLIENTS: lambda headers, rows: clients_importer.preview(headers, rows, {}),
    ImportKind.ATTENDANCE: lambda headers, rows: attendance_importer.preview(headers, rows),
    ImportKind.PAYMENTS: lambda headers, rows: payments_importer.preview(headers, rows),
    ImportKind.GROUPS: lambda headers, rows: reference_importer.preview_groups(headers, rows),
    ImportKind.TRAINERS: lambda headers, rows: reference_importer.preview_trainers(headers, rows),
}


def _uploaded_file(request):
    file = request.FILES.get("file")
    if file is None:
        raise _field_validation_error(
            "file", "Выберите файл для импорта.", code="required")
    if file.size > clients_importer.MAX_IMPORT_BYTES:
        raise _field_validation_error(
            "file", "Файл импорта превышает лимит 5 МБ.",
            code="max_size")
    return file


def _row_payloads(kind, rows, preview_rows, overrides=None, duplicate_file=False):
    overrides = overrides or {}
    output = []
    for source, preview_row in zip(rows, preview_rows):
        payload = asdict(preview_row)
        override = overrides.get(str(preview_row.index), {})
        payload["row_key"] = stable_row_key(kind, source)
        payload["excluded"] = bool(override.get("excluded"))
        payload["manual_overrides"] = override
        payload["action"] = {
            "new": "create",
            "matched": "create",
            "will_create_session": "create",
            "duplicate": "skip",
            "possible_duplicate": "manual_review",
            "update": "update",
            "skipped": "skip",
            "error": "resolve",
        }.get(payload.get("status"), "review")
        payload.setdefault("warnings", [])
        if duplicate_file:
            payload["warnings"].append("Этот файл уже импортировался ранее")
        output.append(payload)
    return output


def _apply_overrides(rows, overrides):
    result = []
    for index, row in enumerate(rows, start=2):
        changed = dict(row)
        override = (overrides or {}).get(str(index), {})
        changed.update(override.get("data") or {})
        relations = override.get("relations") or {}
        changed.update(relations)
        if "client_id" in relations:
            changed["_manual_client_override"] = True
        result.append(changed)
    return result


def _preview_rows(kind, headers, rows, overrides=None, import_mode="create_only"):
    effective_rows = _apply_overrides(rows, overrides)
    if kind == ImportKind.GROUPS:
        preview_rows = reference_importer.preview_groups(
            headers, effective_rows, mode=import_mode)
    else:
        preview_rows = IMPORTERS[kind](headers, effective_rows)
    return effective_rows, preview_rows


def _prepare_upload(file, kind, mapping=None):
    raw = file.read()
    try:
        headers, rows = clients_importer.parse_source(raw, file.name)
    except ValidationError as exc:
        raise ValidationError({"file": exc}) from exc
    if not headers or not rows:
        raise _field_validation_error(
            "file", "Файл импорта пуст или не содержит строк данных.",
            code="empty")
    if any(not header for header in headers) or len(headers) != len(set(headers)):
        raise _field_validation_error(
            "file", "Заголовки колонок должны быть непустыми и уникальными.",
            code="invalid_headers")
    try:
        prepared = prepare_rows(kind, headers, rows, mapping)
    except ValidationError as exc:
        raise ValidationError({"file": exc}) from exc
    canonical_headers = list(CONTRACTS[kind].field_map)
    return raw, headers, canonical_headers, prepared


def _create_preview_batch(
        *, actor, kind, source_name, source_headers, canonical_headers, source_rows,
        preview_rows, mapping=None, metadata=None, file_hash="", unused_headers=None,
        required_missing=None, source_samples=None, import_mode="create_only",
        effect_mode=ImportEffectMode.NOT_APPLICABLE):
    now = timezone.now()
    ImportBatch.objects.filter(
        status=ImportBatchStatus.PREVIEWED,
        preview_expires_at__lte=now,
    ).delete()
    duplicate_file = bool(file_hash and ImportBatch.objects.filter(
        kind=kind,
        status=ImportBatchStatus.COMMITTED,
        result__file_hash=file_hash,
    ).exists())
    batch = ImportBatch.objects.create(
        created_by=actor,
        source_name=str(source_name or "")[:255],
        kind=kind,
        effect_mode=effect_mode,
        status=ImportBatchStatus.PREVIEWED,
        input_data={
            "headers": canonical_headers,
            "source_headers": source_headers,
            "rows": source_rows,
            "mapping": mapping or {},
            "metadata": metadata or {},
            "file_hash": file_hash,
            "row_overrides": {},
            "unused_headers": unused_headers or [],
            "required_missing": required_missing or [],
            "source_samples": source_samples or {},
            "import_mode": import_mode,
        },
        preview_expires_at=now + PREVIEW_TTL,
        rows_total=len(preview_rows),
    )
    serialized_rows = _row_payloads(
        kind, source_rows, preview_rows, duplicate_file=duplicate_file)
    return JsonResponse({
        "batch_id": batch.id,
        "expires_at": timezone.localtime(batch.preview_expires_at).isoformat(),
        "effect_mode": batch.effect_mode,
        "headers": source_headers,
        "mapping": mapping or {},
        "metadata": metadata or {},
        "own_export": bool(metadata),
        "file_hash": file_hash,
        "duplicate_file": duplicate_file,
        "unused_headers": unused_headers or [],
        "required_missing": required_missing or [],
        "source_samples": source_samples or {},
        "import_mode": import_mode,
        "field_options": field_options(kind),
        "rows": serialized_rows,
        "counts": _status_counts(serialized_rows),
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
        raise _field_validation_error(
            "batch_id", "Некорректный идентификатор preview.",
            code="invalid")
    selected_indices = data.get("selected_indices")
    if not isinstance(selected_indices, list) or not selected_indices:
        raise _field_validation_error(
            "selected_indices", "Выберите строки для импорта.",
            code="required")
    if any(isinstance(index, bool) or not isinstance(index, int) for index in selected_indices):
        raise _field_validation_error(
            "selected_indices", "Список выбранных строк повреждён.",
            code="invalid")
    if len(selected_indices) != len(set(selected_indices)):
        raise _field_validation_error(
            "selected_indices", "Выбранные строки не должны повторяться.",
            code="duplicate")
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


def _selected_rows(preview_rows, selected_indices, overrides=None):
    excluded = {
        int(index) for index, override in (overrides or {}).items()
        if override.get("excluded")
    }
    selected_excluded = selected_indices & excluded
    if selected_excluded:
        raise ValidationError(
            f"Исключённые строки нельзя импортировать: {', '.join(map(str, sorted(selected_excluded)))}")
    available = {row.index for row in preview_rows}
    unknown = selected_indices - available
    if unknown:
        raise ValidationError(
            f"В batch отсутствуют строки: {', '.join(map(str, sorted(unknown)))}")
    return [row for row in preview_rows if row.index in selected_indices]


def _report_rows(preview_rows, selected_indices, overrides=None, created_ids=None,
                 commit_errors=None, updated_ids=None):
    selected_indices = set(selected_indices)
    created_ids = iter(created_ids or [])
    updated_ids = iter(updated_ids or [])
    error_rows = {
        int(match.group(1))
        for message in (commit_errors or [])
        if (match := re.search(r"Строка (\d+)", str(message)))
    }
    report = []
    for row in preview_rows:
        selected = row.index in selected_indices
        updated = selected and row.index not in error_rows and row.status == "update"
        created = (selected and row.index not in error_rows
                   and row.status not in {"error", "duplicate", "skipped", "update"})
        report.append({
            "row_number": row.index,
            "result": "updated" if updated else ("created" if created else "skipped"),
            "created_id": (next(updated_ids, "") if updated
                           else (next(created_ids, "") if created else "")),
            "matched_client_id": row.resolved.get("student_id", ""),
            "source_data": row.data,
            "applied_changes": (overrides or {}).get(str(row.index), {}),
            "errors": row.errors,
            "warnings": row.warnings,
        })
    return report


def _complete_batch(batch, summary, rows_imported, *, report_rows=None):
    staged = batch.input_data if isinstance(batch.input_data, dict) else {}
    result = {
        **summary,
        "file_hash": staged.get("file_hash", ""),
        "source_system": (staged.get("metadata") or {}).get("source_system", "external"),
        "schema_version": (staged.get("metadata") or {}).get("schema_version", "external"),
        "mapping": staged.get("mapping") or {},
        "manual_corrections": staged.get("row_overrides") or {},
        "import_mode": staged.get("import_mode", "create_only"),
        "rollback_strategy": ROLLBACK_STRATEGIES[batch.kind],
        "report_rows": report_rows or [],
    }
    batch.status = ImportBatchStatus.COMMITTED
    batch.committed_at = timezone.now()
    batch.preview_expires_at = None
    batch.input_data = {}
    batch.result = result
    batch.rows_imported = rows_imported
    batch.save(update_fields=[
        "status", "committed_at", "preview_expires_at", "input_data",
        "result", "rows_imported",
    ])


# ---------------------------------------------------------------- clients ---

def _mapping_from_request(request):
    try:
        mapping = json.loads(request.POST.get("mapping") or "{}")
    except json.JSONDecodeError as exc:
        raise _field_validation_error(
            "mapping", "Некорректное сопоставление колонок.",
            code="invalid_json") from exc
    if not isinstance(mapping, dict):
        raise _field_validation_error(
            "mapping", "Сопоставление колонок должно быть объектом.",
            code="invalid")
    return mapping

@require_POST
def admin_import_clients_preview(request):
    actor = _admin_required(request)
    file = _uploaded_file(request)
    mapping = _mapping_from_request(request)
    raw, source_headers, canonical_headers, prepared = _prepare_upload(
        file, ImportKind.CLIENTS, mapping)
    rows, preview_rows = _preview_rows(
        ImportKind.CLIENTS, canonical_headers, prepared["rows"])
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.CLIENTS,
        source_name=file.name,
        source_headers=source_headers,
        canonical_headers=canonical_headers,
        source_rows=rows,
        preview_rows=preview_rows,
        mapping=prepared["mapping"],
        metadata=prepared["metadata"],
        file_hash=sha256(raw).hexdigest(),
        unused_headers=prepared["unused_headers"],
        required_missing=prepared["required_missing"],
        source_samples=prepared["source_samples"],
    )


@require_POST
@transaction.atomic
def admin_import_clients_commit(request):
    actor = _admin_required(request)
    batch_id, selected_indices, _data = _commit_data(request)
    batch, headers, rows, mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=ImportKind.CLIENTS)
    staged = dict(batch.input_data)
    rows = _apply_overrides(rows, staged.get("row_overrides"))
    preview_rows = clients_importer.preview(headers, rows, {})
    selected_rows = _selected_rows(
        preview_rows, selected_indices, staged.get("row_overrides"))
    batch = clients_importer.commit(
        selected_rows,
        actor=actor,
        source_name=batch.source_name,
        batch=batch,
    )
    batch.result = {
        **batch.result,
        "file_hash": staged.get("file_hash", ""),
        "source_system": (staged.get("metadata") or {}).get("source_system", "external"),
        "schema_version": (staged.get("metadata") or {}).get("schema_version", "external"),
        "mapping": staged.get("mapping") or {},
        "manual_corrections": staged.get("row_overrides") or {},
        "import_mode": staged.get("import_mode", "create_only"),
        "rollback_strategy": ROLLBACK_STRATEGIES[ImportKind.CLIENTS],
        "report_rows": _report_rows(
            preview_rows, selected_indices, staged.get("row_overrides"),
            batch.created_student_ids),
    }
    batch.save(update_fields=["result"])
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
        raise _field_validation_error(
            "effect_mode", "Выберите допустимый режим импорта посещаемости.",
            code="invalid_choice")
    mapping = _mapping_from_request(request)
    raw, source_headers, canonical_headers, prepared = _prepare_upload(
        file, ImportKind.ATTENDANCE, mapping)
    rows, preview_rows = _preview_rows(
        ImportKind.ATTENDANCE, canonical_headers, prepared["rows"])
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.ATTENDANCE,
        source_name=file.name,
        source_headers=source_headers,
        canonical_headers=canonical_headers,
        source_rows=rows,
        preview_rows=preview_rows,
        mapping=prepared["mapping"],
        metadata=prepared["metadata"],
        file_hash=sha256(raw).hexdigest(),
        unused_headers=prepared["unused_headers"],
        required_missing=prepared["required_missing"],
        source_samples=prepared["source_samples"],
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
            raise _field_validation_error(
                "confirm_financial_effects",
                "Подтвердите применение финансовых последствий исторического импорта.",
                code="required")
    elif data.get("confirm_financial_effects") is True:
        raise _field_validation_error(
            "confirm_financial_effects",
            "Финансовое подтверждение не соответствует безопасному режиму импорта.",
            code="invalid")
    rows = _apply_overrides(rows, batch.input_data.get("row_overrides"))
    preview_rows = attendance_importer.preview(headers, rows)
    selected_rows = _selected_rows(
        preview_rows, selected_indices, batch.input_data.get("row_overrides"))
    summary = attendance_importer.commit(
        selected_rows, actor=actor, mode=batch.effect_mode)
    _complete_batch(
        batch, summary, summary["created_records"],
        report_rows=_report_rows(
            preview_rows, selected_indices, batch.input_data.get("row_overrides"),
            summary.get("created_ids"), summary.get("errors")))
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
    mapping = _mapping_from_request(request)
    raw, source_headers, canonical_headers, prepared = _prepare_upload(
        file, ImportKind.PAYMENTS, mapping)
    rows, preview_rows = _preview_rows(
        ImportKind.PAYMENTS, canonical_headers, prepared["rows"])
    return _create_preview_batch(
        actor=actor,
        kind=ImportKind.PAYMENTS,
        source_name=file.name,
        source_headers=source_headers,
        canonical_headers=canonical_headers,
        source_rows=rows,
        preview_rows=preview_rows,
        mapping=prepared["mapping"],
        metadata=prepared["metadata"],
        file_hash=sha256(raw).hexdigest(),
        unused_headers=prepared["unused_headers"],
        required_missing=prepared["required_missing"],
        source_samples=prepared["source_samples"],
    )


@require_POST
@transaction.atomic
def admin_import_payments_commit(request):
    actor = _admin_required(request)
    batch_id, selected_indices, data = _commit_data(
        request, allowed_fields=PAYMENTS_COMMIT_FIELDS)
    batch, headers, rows, _mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=ImportKind.PAYMENTS)
    rows = _apply_overrides(rows, batch.input_data.get("row_overrides"))
    preview_rows = payments_importer.preview(headers, rows)
    selected_rows = _selected_rows(
        preview_rows, selected_indices, batch.input_data.get("row_overrides"))
    summary = payments_importer.commit(
        selected_rows,
        actor=actor,
        approve_possible_duplicates=data.get("approve_possible_duplicates") is True,
    )
    _complete_batch(
        batch, summary, summary["created"] + summary.get("updated", 0),
        report_rows=_report_rows(
            preview_rows, selected_indices, batch.input_data.get("row_overrides"),
            summary.get("created_ids"), summary.get("errors")))
    audit(actor, "payments.import_committed", batch, {
        "rows_imported": summary["created"],
        "possible_duplicates_approved": data.get("approve_possible_duplicates") is True,
    })
    return JsonResponse({"batch_id": batch.id, **summary}, status=201)


# ------------------------------------------------------ groups / trainers ---

def _reference_preview(request, kind):
    actor = _admin_required(request)
    file = _uploaded_file(request)
    mapping = _mapping_from_request(request)
    import_mode = request.POST.get("import_mode") or "create_only"
    if kind != ImportKind.GROUPS and import_mode != "create_only":
        raise _field_validation_error(
            "import_mode", "Для этого типа доступен только режим создания.",
            code="invalid_choice")
    if kind == ImportKind.GROUPS and import_mode not in reference_importer.REFERENCE_IMPORT_MODES:
        raise _field_validation_error(
            "import_mode", "Выберите допустимый режим импорта групп.",
            code="invalid_choice")
    raw, source_headers, canonical_headers, prepared = _prepare_upload(file, kind, mapping)
    rows, preview_rows = _preview_rows(
        kind, canonical_headers, prepared["rows"], import_mode=import_mode)
    return _create_preview_batch(
        actor=actor,
        kind=kind,
        source_name=file.name,
        source_headers=source_headers,
        canonical_headers=canonical_headers,
        source_rows=rows,
        preview_rows=preview_rows,
        mapping=prepared["mapping"],
        metadata=prepared["metadata"],
        file_hash=sha256(raw).hexdigest(),
        unused_headers=prepared["unused_headers"],
        required_missing=prepared["required_missing"],
        source_samples=prepared["source_samples"],
        import_mode=import_mode,
    )


def _reference_commit(request, kind, commit_function):
    actor = _admin_required(request)
    batch_id, selected_indices, _data = _commit_data(request)
    batch, headers, rows, _mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=kind)
    import_mode = batch.input_data.get("import_mode", "create_only")
    rows, preview_rows = _preview_rows(
        kind, headers, rows, batch.input_data.get("row_overrides"), import_mode)
    selected_rows = _selected_rows(
        preview_rows, selected_indices, batch.input_data.get("row_overrides"))
    summary = (commit_function(selected_rows, actor=actor, mode=import_mode)
               if kind == ImportKind.GROUPS else commit_function(selected_rows, actor=actor))
    _complete_batch(
        batch, summary, summary["created"] + summary.get("updated", 0),
        report_rows=_report_rows(
            preview_rows, selected_indices, batch.input_data.get("row_overrides"),
            summary.get("created_ids"), summary.get("errors"),
            summary.get("updated_ids")))
    audit(actor, f"{kind}.import_committed", batch, {
        "rows_imported": summary["created"] + summary.get("updated", 0),
        "rows_updated": summary.get("updated", 0),
        "errors": len(summary["errors"]),
    })
    return JsonResponse({"batch_id": batch.id, **summary}, status=201)


@require_POST
def admin_import_groups_preview(request):
    return _reference_preview(request, ImportKind.GROUPS)


@require_POST
@transaction.atomic
def admin_import_groups_commit(request):
    return _reference_commit(request, ImportKind.GROUPS, reference_importer.commit_groups)


@require_http_methods(["GET", "POST"])
@transaction.atomic
def admin_import_groups_rollback(request, batch_id):
    actor = _admin_required(request)
    batch = ImportBatch.objects.select_for_update().filter(
        pk=batch_id,
        kind=ImportKind.GROUPS,
        status=ImportBatchStatus.COMMITTED,
        created_by=actor,
    ).first()
    if batch is None:
        raise ValidationError("Импорт групп не найден")
    preview = reference_importer.rollback_groups_preview(batch.result)
    if request.method == "GET":
        return JsonResponse(preview)
    data = _json_body(request)
    if set(data) - {"confirm_batch_id", "confirm_rollback"}:
        raise ValidationError("Недопустимые поля rollback")
    if data.get("confirm_rollback") is not True or str(data.get("confirm_batch_id")) != str(batch.id):
        raise ValidationError("Подтвердите откат точным ID import batch")
    if not preview["can_rollback"]:
        raise ValidationError("Откат заблокирован зависимостями или последующими изменениями")
    reference_importer.rollback_groups(batch.result)
    batch.status = ImportBatchStatus.ROLLED_BACK
    batch.is_rolled_back = True
    batch.save(update_fields=["status", "is_rolled_back"])
    audit(actor, "groups.import_rolled_back", batch, preview)
    return JsonResponse({"ok": True, "batch_id": batch.id, **preview})


@require_POST
def admin_import_trainers_preview(request):
    return _reference_preview(request, ImportKind.TRAINERS)


@require_POST
@transaction.atomic
def admin_import_trainers_commit(request):
    return _reference_commit(request, ImportKind.TRAINERS, reference_importer.commit_trainers)


# ----------------------------------------------------- shared staging API ---

def _import_kind(value):
    if value not in ImportKind.values:
        raise ValidationError("Неизвестный тип import batch")
    return value


def _locked_batch_for_edit(*, batch_id, actor, kind):
    batch, headers, rows, _mapping = _locked_preview_batch(
        batch_id=batch_id, actor=actor, kind=_import_kind(kind))
    return batch, headers, rows


def _validated_override(kind, data):
    if set(data) - {"data", "relations", "excluded"}:
        raise ValidationError("Недопустимые поля изменения staging-строки")
    values = data.get("data") or {}
    relations = data.get("relations") or {}
    if not isinstance(values, dict) or not isinstance(relations, dict):
        errors = {}
        if not isinstance(values, dict):
            errors["data"] = ValidationError(
                "Данные строки должны быть объектом.", code="invalid")
        if not isinstance(relations, dict):
            errors["relations"] = ValidationError(
                "Связи строки должны быть объектом.", code="invalid")
        raise ValidationError(errors)
    contract = CONTRACTS[kind]
    editable = {field.key for field in contract.fields if field.editable}
    relation_fields = {field.key for field in contract.fields if field.relation}
    protected = set(values) - editable
    invalid_relations = set(relations) - relation_fields
    if protected:
        raise ValidationError(
            f"Защищённые поля нельзя редактировать: {', '.join(sorted(protected))}")
    if invalid_relations:
        raise ValidationError(
            f"Недопустимые relation overrides: {', '.join(sorted(invalid_relations))}")
    if "excluded" in data and not isinstance(data["excluded"], bool):
        raise _field_validation_error(
            "excluded", "Флаг исключения должен быть логическим значением.",
            code="invalid")
    normalize = lambda value: "" if value is None else str(value).strip()
    return {
        "data": {key: normalize(value) for key, value in values.items()},
        "relations": {key: normalize(value) for key, value in relations.items()},
        "excluded": bool(data.get("excluded", False)),
        "manual": True,
    }


@require_http_methods(["PATCH"])
@transaction.atomic
def admin_import_row_update(request, kind, batch_id, row_index):
    actor = _admin_required(request)
    batch, headers, rows = _locked_batch_for_edit(
        batch_id=batch_id, actor=actor, kind=kind)
    if row_index < 2 or row_index > len(rows) + 1:
        raise ValidationError("Строка import batch не найдена")
    request_data = _json_body(request)
    override_patch = _validated_override(kind, request_data)
    payload = dict(batch.input_data)
    overrides = dict(payload.get("row_overrides") or {})
    override = dict(overrides.get(str(row_index)) or {})
    override["data"] = {
        **(override.get("data") or {}), **override_patch["data"]}
    override["relations"] = {
        **(override.get("relations") or {}), **override_patch["relations"]}
    if "excluded" in request_data:
        override["excluded"] = override_patch["excluded"]
    override["manual"] = True
    overrides[str(row_index)] = override
    payload["row_overrides"] = overrides
    batch.input_data = payload
    batch.save(update_fields=["input_data"])
    effective_rows, preview_rows = _preview_rows(
        kind, headers, rows, overrides, payload.get("import_mode", "create_only"))
    duplicate_file = bool(payload.get("file_hash") and ImportBatch.objects.filter(
        kind=kind, status=ImportBatchStatus.COMMITTED,
        result__file_hash=payload.get("file_hash")).exists())
    serialized = _row_payloads(
        kind, effective_rows, preview_rows, overrides, duplicate_file)
    return JsonResponse({
        "batch_id": batch.id,
        "row": serialized[row_index - 2],
        "counts": _status_counts(serialized),
    })


def _status_counts(rows):
    counts = {"total": len(rows), "excluded": 0}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
        if row.get("excluded"):
            counts["excluded"] += 1
    return counts


@require_POST
@transaction.atomic
def admin_import_rows_bulk(request, kind, batch_id):
    actor = _admin_required(request)
    batch, headers, rows = _locked_batch_for_edit(
        batch_id=batch_id, actor=actor, kind=kind)
    data = _json_body(request)
    indices = data.pop("indices", None)
    if not isinstance(indices, list) or not indices:
        raise _field_validation_error(
            "indices", "Выберите хотя бы одну строку.", code="required")
    if any(isinstance(index, bool) or not isinstance(index, int) for index in indices):
        raise _field_validation_error(
            "indices", "Список выбранных строк повреждён.", code="invalid")
    if set(indices) - set(range(2, len(rows) + 2)):
        raise _field_validation_error(
            "indices", "Одна или несколько строк отсутствуют в preview.",
            code="invalid_choice")
    override_patch = _validated_override(kind, data)
    payload = dict(batch.input_data)
    overrides = dict(payload.get("row_overrides") or {})
    for index in indices:
        current = dict(overrides.get(str(index)) or {})
        current["data"] = {**(current.get("data") or {}), **override_patch["data"]}
        current["relations"] = {
            **(current.get("relations") or {}), **override_patch["relations"]}
        if "excluded" in data:
            current["excluded"] = override_patch["excluded"]
        current["manual"] = True
        overrides[str(index)] = current
    payload["row_overrides"] = overrides
    batch.input_data = payload
    batch.save(update_fields=["input_data"])
    effective_rows, preview_rows = _preview_rows(
        kind, headers, rows, overrides, payload.get("import_mode", "create_only"))
    serialized = _row_payloads(kind, effective_rows, preview_rows, overrides)
    return JsonResponse({"batch_id": batch.id, "rows": serialized,
                         "counts": _status_counts(serialized)})


@require_GET
def admin_import_contract(request):
    _admin_required(request)
    return JsonResponse(contract_payload())


@require_GET
def admin_import_client_search(request):
    _admin_required(request)
    query = request.GET.get("q", "").strip()
    if not query:
        return JsonResponse({"clients": []})
    students = Student.objects.select_related("parent__user").order_by("last_name", "first_name", "id")
    filtered = students.filter(
        Q(email__icontains=query) |
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query) |
        Q(parent__phone__icontains=query) |
        Q(parent__user__username__icontains=query)
    )
    if query.isdigit():
        filtered = (students.filter(pk=int(query)) | filtered).distinct()
    normalized = normalize_phone(query)
    matches = list(filtered[:50])
    if normalized:
        known = {student.id for student in matches}
        for student in students[:2000]:
            if student.id not in known and normalize_phone(student.parent.phone) == normalized:
                matches.append(student)
    return JsonResponse({"clients": [{
        "id": student.id,
        "name": student.full_name,
        "email": student.email,
        "phone": student.parent.phone,
        "birth_date": student.birth_date.isoformat() if student.birth_date else "",
    } for student in matches[:20]]})


@require_GET
def admin_import_batch_report(request, batch_id, fmt):
    actor = _admin_required(request)
    if fmt not in {"csv", "xlsx"}:
        raise ValidationError("Формат отчёта должен быть csv или xlsx")
    batch = ImportBatch.objects.filter(
        pk=batch_id, created_by=actor,
        status__in=(ImportBatchStatus.COMMITTED, ImportBatchStatus.ROLLED_BACK),
    ).first()
    if batch is None:
        raise ValidationError("Import batch не найден")
    result = batch.result if isinstance(batch.result, dict) else {}
    report_rows = result.get("report_rows") or []
    headers = (
        "row_number", "result", "created_id", "matched_client_id",
        "source_data", "applied_changes", "errors", "warnings",
    )
    rows = [[
        item.get("row_number", ""),
        item.get("result", ""),
        item.get("created_id", ""),
        item.get("matched_client_id", ""),
        json.dumps(item.get("source_data") or {}, ensure_ascii=False, sort_keys=True),
        json.dumps(item.get("applied_changes") or {}, ensure_ascii=False, sort_keys=True),
        "; ".join(item.get("errors") or []),
        "; ".join(item.get("warnings") or []),
    ] for item in report_rows]
    if fmt == "csv":
        content = rows_to_csv(headers, rows)
        content_type = "text/csv; charset=utf-8"
    else:
        content = rows_to_xlsx(f"Import {batch.id}", headers, rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = (
        f'attachment; filename="import-{batch.kind}-{batch.id}-report.{fmt}"')
    return response


__all__ = [name for name in globals() if not name.startswith("__")]
