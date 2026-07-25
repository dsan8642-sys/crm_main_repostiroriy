"""HTTP layer for the client/attendance/payments import pipelines.

Every endpoint follows the same two-phase contract:
  POST .../preview/ — multipart `file` (+ `mapping` JSON for clients) -> row-level plan
  POST .../commit/  — JSON `{"rows": [...]}` (the SAME rows echoed back by preview,
                       not the file) -> writes, re-validating each row server-side
"""
import json
from dataclasses import asdict

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from dataio import attendance_importer, payments_importer
from dataio import importer as clients_importer
from dataio.models import ImportBatch

from .admin_support import _admin_required
from .support import _json_body


def _uploaded_file(request):
    file = request.FILES.get("file")
    if file is None:
        raise ValidationError("Файл не передан")
    return file


def _rows_from_body(request, row_cls):
    data = _json_body(request)
    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValidationError("Нет строк для импорта")
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValidationError("Некорректный формат строки импорта")
        kwargs = {
            "index": row.get("index"),
            "data": row.get("data") or {},
            "status": row.get("status") or "error",
            "errors": list(row.get("errors") or []),
        }
        if "resolved" in row_cls.__dataclass_fields__:
            kwargs["resolved"] = row.get("resolved") or {}
        result.append(row_cls(**kwargs))
    return result, data


# ---------------------------------------------------------------- clients ---

@require_POST
def admin_import_clients_preview(request):
    _admin_required(request)
    file = _uploaded_file(request)
    try:
        mapping = json.loads(request.POST.get("mapping") or "{}")
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid mapping JSON: {exc}") from exc
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = clients_importer.preview(headers, rows, mapping)
    return JsonResponse({"headers": headers, "rows": [asdict(pr) for pr in preview_rows]})


@require_POST
def admin_import_clients_commit(request):
    actor = _admin_required(request)
    preview_rows, data = _rows_from_body(request, clients_importer.PreviewRow)
    batch = clients_importer.commit(
        preview_rows, actor=actor, source_name=data.get("source_name", ""))
    return JsonResponse({
        "batch_id": batch.id, "rows_total": batch.rows_total, "rows_imported": batch.rows_imported,
    }, status=201)


@require_POST
def admin_import_clients_rollback(request, batch_id):
    _admin_required(request)
    batch = ImportBatch.objects.filter(pk=batch_id).first()
    if batch is None:
        raise ValidationError("Импорт не найден")
    clients_importer.rollback(batch)
    return JsonResponse({"ok": True})


# ------------------------------------------------------------- attendance ---

@require_POST
def admin_import_attendance_preview(request):
    _admin_required(request)
    file = _uploaded_file(request)
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = attendance_importer.preview(headers, rows)
    return JsonResponse({"headers": headers, "rows": [asdict(pr) for pr in preview_rows]})


@require_POST
def admin_import_attendance_commit(request):
    actor = _admin_required(request)
    preview_rows, _data = _rows_from_body(request, attendance_importer.AttendancePreviewRow)
    summary = attendance_importer.commit(preview_rows, actor=actor)
    return JsonResponse(summary, status=201)


# --------------------------------------------------------------- payments ---

@require_POST
def admin_import_payments_preview(request):
    _admin_required(request)
    file = _uploaded_file(request)
    headers, rows = clients_importer.parse_source(file.read(), file.name)
    preview_rows = payments_importer.preview(headers, rows)
    return JsonResponse({"headers": headers, "rows": [asdict(pr) for pr in preview_rows]})


@require_POST
def admin_import_payments_commit(request):
    actor = _admin_required(request)
    preview_rows, _data = _rows_from_body(request, payments_importer.PaymentPreviewRow)
    summary = payments_importer.commit(preview_rows, actor=actor)
    return JsonResponse(summary, status=201)


__all__ = [name for name in globals() if not name.startswith("__")]
