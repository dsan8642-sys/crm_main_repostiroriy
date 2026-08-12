from .support import *
from .admin_support import _admin_required
from analytics.exporters import sheets_to_xlsx
from analytics.reports import (
    confirmed_payments_for_period,
    income_breakdown_for_period,
    session_counts_for_period,
)
from common.money import CURRENCY_CHOICES
from .pagination import paginated_payload


XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _report_period(request):
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if not date_from or not date_to:
        missing = {}
        if not date_from:
            missing["date_from"] = ValidationError(
                "Укажите начальную дату.", code="required")
        if not date_to:
            missing["date_to"] = ValidationError(
                "Укажите конечную дату.", code="required")
        raise ValidationError(missing)
    if date_to < date_from:
        raise _field_validation_error(
            "date_to", "Конечная дата не может быть раньше начальной.",
            code="invalid_range")
    return date_from, date_to


def _report_currency(request):
    currency = (request.GET.get("currency") or settings.DEFAULT_CURRENCY).upper()
    allowed = [code for code, _label in CURRENCY_CHOICES]
    if currency not in allowed:
        raise _field_validation_error(
            "currency", "Выберите поддерживаемую валюту.", code="invalid_choice")
    return currency, allowed


def _report_trainer(request):
    value = request.GET.get("trainer_id")
    if value in (None, ""):
        return None
    trainer_id = _required_int(value, "trainer_id")
    trainer = Trainer.objects.select_related("user").filter(pk=trainer_id).first()
    if trainer is None:
        raise _field_validation_error(
            "trainer_id", "Тренер не найден.", code="invalid_choice")
    return trainer


def _payment_report_payload(payment):
    return {
        "id": payment.id,
        "client_id": payment.student.parent_id,
        "client": payment.student.full_name,
        "participant_id": payment.student_id,
        "participant": payment.student.full_name,
        "paid_at": payment.paid_at.isoformat(),
        "method": payment.method,
        "method_label": payment.get_method_display(),
        "amount": payment.amount.format(),
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
    }


def _xlsx_response(content, filename):
    response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _debtor_payload(row):
    today = timezone.localdate()
    overdue = Charge.objects.filter(student=row.student, due_date__lt=today).order_by("due_date").first()
    last_payment = Payment.objects.filter(student=row.student, status=PaymentStatus.CONFIRMED).order_by("-paid_at", "-id").first()
    return {
        "student": _student_payload(row.student),
        "reasons": row.reasons,
        "balance_minor": row.balance_minor,
        "currency": row.currency,
        "oldest_due_date": overdue.due_date.isoformat() if overdue else None,
        "days_overdue": (today - overdue.due_date).days if overdue else 0,
        "last_payment_at": last_payment.paid_at.isoformat() if last_payment else None,
    }

@require_GET
def admin_debtors(request):
    _admin_required(request)
    return JsonResponse({"debtors": [_debtor_payload(row) for row in debtors()]})


@require_GET
def admin_upcoming(request):
    _admin_required(request)
    within_days = _required_int(
        request.GET.get("within_days", "7"), "within_days")
    min_sessions_value = request.GET.get("min_sessions")
    min_sessions = (
        _required_int(min_sessions_value, "min_sessions")
        if min_sessions_value not in (None, "") else None)
    if within_days < 0:
        raise _field_validation_error(
            "within_days", "Укажите неотрицательное число дней.",
            code="min_value")
    if min_sessions is not None and min_sessions < 0:
        raise _field_validation_error(
            "min_sessions", "Укажите неотрицательное число занятий.",
            code="min_value")
    return JsonResponse({"upcoming": [{
        "student": _student_payload(row.student),
        "subscription": _subscription_payload(row.subscription),
        "days_left": row.days_left,
        "sessions_left": row.sessions_left,
    } for row in upcoming(within_days=within_days, min_sessions=min_sessions)]})


@require_GET
def admin_income_report(request):
    _admin_required(request)
    date_from, date_to = _report_period(request)
    currency, available_currencies = _report_currency(request)
    breakdown = income_breakdown_for_period(date_from, date_to, currency)
    payments = confirmed_payments_for_period(date_from, date_to, currency)
    details = paginated_payload(
        request, payments, key="payments", serializer=_payment_report_payload)
    return JsonResponse({
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "total": breakdown["total"].format(),
        "total_minor": breakdown["total"].amount_minor,
        "cash": breakdown["cash"].format(),
        "cash_minor": breakdown["cash"].amount_minor,
        "non_cash": breakdown["non_cash"].format(),
        "non_cash_minor": breakdown["non_cash"].amount_minor,
        "currency": currency,
        "available_currencies": available_currencies,
        "by_group": [{"group": name, "amount": amount.format(), "amount_minor": amount.amount_minor}
                     for name, amount in income_by_group(date_from, date_to, currency)],
        "by_trainer": [{"trainer": name, "amount": amount.format(), "amount_minor": amount.amount_minor}
                       for name, amount in income_by_trainer(date_from, date_to, currency)],
        **details,
    })


@require_GET
def admin_session_counts_report(request):
    _admin_required(request)
    date_from, date_to = _report_period(request)
    trainer = _report_trainer(request)
    rows, totals = session_counts_for_period(date_from, date_to, trainer)
    return JsonResponse({
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "trainer_id": trainer.id if trainer else None,
        "rows": rows,
        "totals": totals,
    })


@require_GET
def admin_session_counts_xlsx(request):
    _admin_required(request)
    date_from, date_to = _report_period(request)
    trainer = _report_trainer(request)
    rows, totals = session_counts_for_period(date_from, date_to, trainer)
    workbook = sheets_to_xlsx([
        (
            "Итоги",
            ["Период с", "Период по", "Групповые", "Индивидуальные", "Split", "Всего"],
            [[
                date_from.isoformat(), date_to.isoformat(), totals["group"],
                totals["individual"], totals["split"], totals["total"],
            ]],
        ),
        (
            "По тренерам",
            ["Тренер", "Активен", "Групповые", "Индивидуальные", "Split", "Всего"],
            [[
                row["trainer"], "Да" if row["is_active"] else "Нет", row["group"],
                row["individual"], row["split"], row["total"],
            ] for row in rows],
        ),
    ])
    return _xlsx_response(
        workbook, f"session-counts-{date_from.isoformat()}-{date_to.isoformat()}.xlsx")


@require_GET
def admin_income_report_xlsx(request):
    _admin_required(request)
    date_from, date_to = _report_period(request)
    currency, _available_currencies = _report_currency(request)
    breakdown = income_breakdown_for_period(date_from, date_to, currency)
    payments = confirmed_payments_for_period(date_from, date_to, currency)
    workbook = sheets_to_xlsx([
        (
            "Сводка",
            ["Период с", "Период по", "Валюта", "Всего", "Наличные", "Безналичные"],
            [[
                date_from.isoformat(), date_to.isoformat(), currency,
                breakdown["total"].format(), breakdown["cash"].format(),
                breakdown["non_cash"].format(),
            ]],
        ),
        (
            "Платежи",
            ["Дата", "Клиент", "Способ", "Сумма", "Сумма, гроши", "Валюта"],
            [[
                payment.paid_at.isoformat(), payment.student.full_name,
                payment.get_method_display(), payment.amount.format(),
                payment.amount_minor, payment.currency,
            ] for payment in payments],
        ),
    ])
    return _xlsx_response(
        workbook, f"income-{date_from.isoformat()}-{date_to.isoformat()}-{currency}.xlsx")


@require_GET
def admin_export(request, entity, fmt):
    _admin_required(request)
    if fmt not in {"xlsx", "csv"}:
        raise _field_validation_error(
            "fmt", "Формат должен быть CSV или XLSX.",
            code="invalid_choice")
    filename, content = export_entity(entity, fmt)
    content_type = "text/csv; charset=utf-8" if fmt == "csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


