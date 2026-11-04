from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload

from datetime import date

from payroll.models import (PayrollPeriod, PayrollRate, PayrollRateVersion, PayrollRule, PayrollScheme,
                            TrainerPayrollAssignment)
from payroll.services import assign_rate, calculate_payroll_period, payroll_totals_by_trainer, recalculate_open_periods


def _rate_payload(rate):
    versions = list(rate.versions.order_by("-effective_from"))
    current = next((v for v in versions if v.effective_from <= timezone.localdate()), versions[0] if versions else None)
    return {"id": rate.id, "name": rate.name, "session_type": rate.session_type,
            "is_active": rate.is_active,
            "base_amount_minor": current.base_amount_minor if current else None,
            "currency": current.currency if current else "PLN",
            "min_clients_threshold": current.min_clients_threshold if current else None,
            "extra_client_amount_minor": current.extra_client_amount_minor if current else None,
            "versions": [{"effective_from": v.effective_from.isoformat(),
                          "base_amount_minor": v.base_amount_minor, "currency": v.currency,
                          "min_clients_threshold": v.min_clients_threshold,
                          "extra_client_amount_minor": v.extra_client_amount_minor} for v in versions]}


def _rate_version(rate, data, effective_from):
    version, _ = PayrollRateVersion.objects.get_or_create(rate=rate, effective_from=effective_from,
        defaults={"base_amount_minor": 0})
    version.base_amount_minor = _required_int(data.get("base_amount_minor"), "base_amount_minor")
    version.currency = data.get("currency") or "PLN"
    version.min_clients_threshold = (_required_int(data["min_clients_threshold"], "min_clients_threshold")
        if data.get("min_clients_threshold") not in (None, "") else None)
    version.extra_client_amount_minor = (_required_int(data["extra_client_amount_minor"], "extra_client_amount_minor")
        if data.get("extra_client_amount_minor") not in (None, "") else None)
    version.full_clean()
    version.save()


@require_http_methods(["GET", "POST"])
def admin_payroll_rates(request):
    user = _admin_required(request)
    if request.method == "GET":
        return JsonResponse({"rates": [_rate_payload(rate) for rate in PayrollRate.objects.prefetch_related("versions").order_by("name", "id")]})
    data = _json_body(request)
    with transaction.atomic():
        rate = PayrollRate(name=data.get("name", ""), session_type=data.get("session_type", ""))
        rate.full_clean()
        rate.save()
        _rate_version(rate, data, date(1900, 1, 1))
    return JsonResponse(_rate_payload(rate), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
def admin_payroll_rate_detail(request, rate_id):
    user = _admin_required(request)
    rate = get_object_or_404(PayrollRate, pk=rate_id)
    if request.method == "GET":
        return JsonResponse(_rate_payload(rate))
    if request.method == "DELETE":
        rate.is_active = False
        rate.save(update_fields=["is_active"])
        return JsonResponse(_rate_payload(rate))
    data = _json_body(request)
    with transaction.atomic():
        if "session_type" in data and data["session_type"] != rate.session_type:
            raise ValidationError({"session_type": "Тип ставки нельзя изменить"})
        if "name" in data:
            rate.name = data["name"]
            rate.full_clean()
            rate.save(update_fields=["name"])
        amount_fields = {"base_amount_minor", "currency", "min_clients_threshold", "extra_client_amount_minor"}
        if amount_fields.intersection(data):
            effective_from = _parse_date(data.get("effective_from"), "effective_from")
            if effective_from is None:
                raise ValidationError({"effective_from": "Дата начала обязательна"})
            previous = rate.versions.filter(effective_from__lte=effective_from).order_by("-effective_from").first()
            merged = {key: getattr(previous, key) for key in amount_fields} if previous else {}
            merged.update(data)
            _rate_version(rate, merged, effective_from)
            recalculate_open_periods(from_date=effective_from, actor=user)
    return JsonResponse(_rate_payload(rate))


@require_http_methods(["POST"])
def admin_payroll_assign_rates(request):
    user = _admin_required(request)
    data = _json_body(request)
    rate = get_object_or_404(PayrollRate, pk=data.get("rate_id"))
    trainer_ids = data.get("trainer_ids")
    if not isinstance(trainer_ids, list) or not trainer_ids or any(type(value) is not int for value in trainer_ids):
        raise ValidationError({"trainer_ids": "Выберите тренеров"})
    active_ids = set(Trainer.objects.filter(pk__in=trainer_ids, is_active=True, user__is_active=True).values_list("id", flat=True))
    if set(trainer_ids) != active_ids:
        raise ValidationError({"trainer_ids": "Выберите действующих тренеров"})
    effective_from = _parse_date(data.get("effective_from"), "effective_from")
    if effective_from is None:
        raise ValidationError({"effective_from": "Дата начала обязательна"})
    location = data.get("location") or ""
    if not isinstance(location, str) or len(location) > 120:
        raise ValidationError({"location": "Некорректный филиал"})
    changed = assign_rate(rate=rate, trainer_ids=trainer_ids, effective_from=effective_from,
                          location=location, actor=user)
    return JsonResponse({"assignments": [_payroll_assignment_payload(item) for item in changed]}, status=201)


def _payroll_scheme_payload(scheme):
    return {
        "id": scheme.id,
        "name": scheme.name,
        "location": scheme.location,
        "is_active": scheme.is_active,
        "created_at": timezone.localtime(scheme.created_at).isoformat() if scheme.created_at else None,
        "updated_at": timezone.localtime(scheme.updated_at).isoformat() if scheme.updated_at else None,
    }


def _payroll_rule_payload(rule):
    return {
        "id": rule.id,
        "scheme_id": rule.scheme_id,
        "session_type": rule.session_type,
        "rule_type": rule.rule_type,
        "base_amount_minor": rule.base_amount_minor,
        "currency": rule.currency,
        "min_clients_threshold": rule.min_clients_threshold,
        "extra_client_amount_minor": rule.extra_client_amount_minor,
        "is_active": rule.is_active,
    }


def _payroll_assignment_payload(assignment):
    return {
        "id": assignment.id,
        "trainer_id": assignment.trainer_id,
        "trainer": str(assignment.trainer),
        "scheme_id": assignment.scheme_id,
        "scheme": assignment.scheme.name if assignment.scheme_id else None,
        "rate_id": assignment.rate_id,
        "rate": assignment.rate.name if assignment.rate_id else None,
        "session_type": assignment.rate.session_type if assignment.rate_id else None,
        "location": assignment.location,
        "effective_from": assignment.effective_from.isoformat(),
        "effective_to": assignment.effective_to.isoformat() if assignment.effective_to else None,
    }


def _payroll_calculation_payload(calc):
    return {
        "id": calc.id,
        "period_id": calc.period_id,
        "trainer_id": calc.trainer_id,
        "trainer": str(calc.trainer),
        "session_id": calc.session_id,
        "session_start_at": timezone.localtime(calc.session.start_at).isoformat(),
        "session_type": calc.session.session_type,
        "attended_clients_count": calc.attended_clients_count,
        "base_amount_minor": calc.base_amount_minor,
        "extra_clients_count": calc.extra_clients_count,
        "extra_amount_minor": calc.extra_amount_minor,
        "final_amount_minor": calc.final_amount_minor,
        "currency": calc.currency,
        "rate_id": calc.rate_version.rate_id if calc.rate_version_id else None,
    }


def _payroll_period_payload(period, include_lines=False):
    payload = {
        "id": period.id,
        "date_from": period.date_from.isoformat(),
        "date_to": period.date_to.isoformat(),
        "location": period.location,
        "status": period.status,
        "skipped_sessions": period.skipped_sessions,
        "totals_by_trainer": payroll_totals_by_trainer(period),
    }
    if include_lines:
        calculations = period.calculations.select_related(
            "trainer__user", "session", "rule", "rate_version").order_by("session__start_at", "id")
        payload["calculations"] = [_payroll_calculation_payload(calc) for calc in calculations]
    return payload


def _apply_payroll_scheme_data(scheme, data):
    data = data.get("scheme") or data
    if "name" in data:
        scheme.name = data.get("name", "") or ""
    if "location" in data:
        scheme.location = data.get("location", "") or ""
    if "is_active" in data:
        scheme.is_active = _bool_value(data.get("is_active"), True)
    scheme.full_clean()
    scheme.save()
    return scheme


def _apply_payroll_rule_data(rule, data):
    data = data.get("rule") or data
    if "scheme_id" in data:
        rule.scheme = _object_for_field(
            PayrollScheme.objects.filter(is_active=True), data.get("scheme_id"),
            "scheme_id", "схему оплаты")
    if "session_type" in data:
        rule.session_type = data.get("session_type", "") or ""
    if "rule_type" in data:
        rule.rule_type = data.get("rule_type", "") or ""
    if "base_amount_minor" in data:
        rule.base_amount_minor = _required_int(
            data.get("base_amount_minor"), "base_amount_minor")
    if "currency" in data:
        rule.currency = data.get("currency", "") or "PLN"
    if "min_clients_threshold" in data:
        value = data.get("min_clients_threshold")
        rule.min_clients_threshold = (
            None if value in (None, "")
            else _required_int(value, "min_clients_threshold"))
    if "extra_client_amount_minor" in data:
        value = data.get("extra_client_amount_minor")
        rule.extra_client_amount_minor = (
            None if value in (None, "")
            else _required_int(value, "extra_client_amount_minor"))
    if "is_active" in data:
        rule.is_active = _bool_value(data.get("is_active"), True)
    rule.full_clean()
    rule.save()
    return rule


def _apply_payroll_assignment_data(assignment, data):
    data = data.get("assignment") or data
    if "trainer_id" in data:
        assignment.trainer = _object_for_field(
            Trainer.objects.filter(is_active=True, user__is_active=True),
            data.get("trainer_id"), "trainer_id", "тренера")
    if "scheme_id" in data:
        assignment.scheme = _object_for_field(
            PayrollScheme.objects.filter(is_active=True), data.get("scheme_id"),
            "scheme_id", "схему оплаты")
    if "effective_from" in data:
        assignment.effective_from = _parse_date(data.get("effective_from"), "effective_from")
    if "effective_to" in data:
        assignment.effective_to = _parse_date(data.get("effective_to"), "effective_to")
    assignment.full_clean()
    assignment.save()
    return assignment


@require_http_methods(["GET", "POST"])
def admin_payroll_schemes(request):
    _admin_required(request)
    if request.method == "POST":
        scheme = _apply_payroll_scheme_data(PayrollScheme(), _json_body(request))
        return JsonResponse(_payroll_scheme_payload(scheme), status=201)
    qs = PayrollScheme.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="schemes", serializer=_payroll_scheme_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_payroll_scheme_detail(request, scheme_id):
    _admin_required(request)
    scheme = get_object_or_404(PayrollScheme, pk=scheme_id)
    if request.method == "DELETE":
        scheme.is_active = False
        scheme.save(update_fields=["is_active"])
        return JsonResponse(_payroll_scheme_payload(scheme))
    if request.method != "GET":
        _apply_payroll_scheme_data(scheme, _json_body(request))
    return JsonResponse(_payroll_scheme_payload(scheme))


@require_http_methods(["GET", "POST"])
def admin_payroll_rules(request):
    _admin_required(request)
    if request.method == "POST":
        rule = _apply_payroll_rule_data(PayrollRule(), _json_body(request))
        return JsonResponse(_payroll_rule_payload(rule), status=201)
    qs = PayrollRule.objects.select_related("scheme").order_by("scheme__name", "session_type", "id")
    if request.GET.get("scheme_id"):
        qs = qs.filter(scheme_id=request.GET["scheme_id"])
    return JsonResponse(paginated_payload(
        request, qs, key="rules", serializer=_payroll_rule_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_payroll_rule_detail(request, rule_id):
    _admin_required(request)
    rule = get_object_or_404(PayrollRule, pk=rule_id)
    if request.method == "DELETE":
        rule.is_active = False
        rule.save(update_fields=["is_active"])
        return JsonResponse(_payroll_rule_payload(rule))
    if request.method != "GET":
        _apply_payroll_rule_data(rule, _json_body(request))
    return JsonResponse(_payroll_rule_payload(rule))


@require_http_methods(["GET", "POST"])
def admin_payroll_assignments(request):
    _admin_required(request)
    if request.method == "POST":
        assignment = _apply_payroll_assignment_data(TrainerPayrollAssignment(), _json_body(request))
        return JsonResponse(_payroll_assignment_payload(assignment), status=201)
    qs = TrainerPayrollAssignment.objects.select_related(
        "trainer__user", "scheme", "rate").filter(rate__isnull=False).order_by("trainer_id", "-effective_from")
    if request.GET.get("trainer_id"):
        qs = qs.filter(trainer_id=request.GET["trainer_id"])
    return JsonResponse(paginated_payload(
        request, qs, key="assignments", serializer=_payroll_assignment_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_payroll_assignment_detail(request, assignment_id):
    _admin_required(request)
    assignment = get_object_or_404(
        TrainerPayrollAssignment.objects.select_related("trainer__user", "scheme"), pk=assignment_id)
    if request.method == "DELETE":
        assignment.delete()
        return JsonResponse({"ok": True, "id": assignment_id})
    if request.method != "GET":
        _apply_payroll_assignment_data(assignment, _json_body(request))
    return JsonResponse(_payroll_assignment_payload(assignment))


@require_http_methods(["GET", "POST"])
def admin_payroll_periods(request):
    user = _admin_required(request)
    if request.method == "POST":
        data = _json_body(request)
        summary = calculate_payroll_period(
            date_from=_parse_date(data.get("date_from"), "date_from"),
            date_to=_parse_date(data.get("date_to"), "date_to"),
            location=data.get("location", "") or "",
            actor=user,
        )
        payload = _payroll_period_payload(summary.period, include_lines=True)
        payload["summary"] = {
            "calculations_count": summary.calculations_count,
            "total_amount_minor": summary.total_amount_minor,
            "currency": summary.currency,
            "skipped": summary.skipped,
        }
        return JsonResponse(payload, status=201)
    qs = PayrollPeriod.objects.order_by("-date_from", "-id")
    return JsonResponse({"periods": [_payroll_period_payload(period) for period in qs[:100]]})


@require_http_methods(["GET", "PATCH"])
def admin_payroll_period_detail(request, period_id):
    _admin_required(request)
    period = get_object_or_404(PayrollPeriod, pk=period_id)
    if request.method == "PATCH":
        if period.status in {"approved", "exported"}:
            raise ValidationError("Утверждённый расчёт нельзя изменять")
        data = _json_body(request)
        with transaction.atomic():
            period.date_from = _parse_date(data.get("date_from"), "date_from")
            period.date_to = _parse_date(data.get("date_to"), "date_to")
            period.location = data.get("location") or ""
            period.full_clean()
            period.save()
            summary = calculate_payroll_period(date_from=period.date_from, date_to=period.date_to,
                                               location=period.location, actor=request.user)
        payload = _payroll_period_payload(period, include_lines=True)
        payload["summary"] = {"calculations_count": summary.calculations_count,
                              "total_amount_minor": summary.total_amount_minor,
                              "currency": summary.currency, "skipped": summary.skipped}
        return JsonResponse(payload)
    return JsonResponse(_payroll_period_payload(period, include_lines=True))
