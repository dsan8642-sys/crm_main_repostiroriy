from .support import *
from .admin_support import _admin_required


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
    currency = request.GET.get("currency", "PLN")
    total = income_for_period(date_from, date_to, currency)
    return JsonResponse({
        "total": total.format(),
        "total_minor": total.amount_minor,
        "currency": currency,
        "by_group": [{"group": name, "amount": amount.format(), "amount_minor": amount.amount_minor}
                     for name, amount in income_by_group(date_from, date_to, currency)],
        "by_trainer": [{"trainer": name, "amount": amount.format(), "amount_minor": amount.amount_minor}
                       for name, amount in income_by_trainer(date_from, date_to, currency)],
    })


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


