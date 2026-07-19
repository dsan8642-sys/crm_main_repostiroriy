from .support import *
from .admin_support import _admin_required

from payroll.models import (PayrollPeriod, PayrollRule, PayrollScheme,
                            TrainerPayrollAssignment)
from payroll.services import calculate_payroll_period, payroll_totals_by_trainer


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
        "scheme": assignment.scheme.name,
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
    }


def _payroll_period_payload(period, include_lines=False):
    payload = {
        "id": period.id,
        "date_from": period.date_from.isoformat(),
        "date_to": period.date_to.isoformat(),
        "location": period.location,
        "status": period.status,
        "totals_by_trainer": payroll_totals_by_trainer(period),
    }
    if include_lines:
        calculations = period.calculations.select_related(
            "trainer__user", "session", "rule").order_by("session__start_at", "id")
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
        rule.scheme = get_object_or_404(PayrollScheme, pk=data.get("scheme_id"))
    if "session_type" in data:
        rule.session_type = data.get("session_type", "") or ""
    if "rule_type" in data:
        rule.rule_type = data.get("rule_type", "") or ""
    if "base_amount_minor" in data:
        rule.base_amount_minor = int(data.get("base_amount_minor") or 0)
    if "currency" in data:
        rule.currency = data.get("currency", "") or "PLN"
    if "min_clients_threshold" in data:
        value = data.get("min_clients_threshold")
        rule.min_clients_threshold = None if value in (None, "") else int(value)
    if "extra_client_amount_minor" in data:
        value = data.get("extra_client_amount_minor")
        rule.extra_client_amount_minor = None if value in (None, "") else int(value)
    if "is_active" in data:
        rule.is_active = _bool_value(data.get("is_active"), True)
    rule.full_clean()
    rule.save()
    return rule


def _apply_payroll_assignment_data(assignment, data):
    data = data.get("assignment") or data
    if "trainer_id" in data:
        assignment.trainer = get_object_or_404(Trainer, pk=data.get("trainer_id"))
    if "scheme_id" in data:
        assignment.scheme = get_object_or_404(PayrollScheme, pk=data.get("scheme_id"))
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
    return JsonResponse({"schemes": [_payroll_scheme_payload(scheme) for scheme in qs[:200]]})


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
    return JsonResponse({"rules": [_payroll_rule_payload(rule) for rule in qs[:200]]})


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
        "trainer__user", "scheme").order_by("trainer_id", "-effective_from")
    if request.GET.get("trainer_id"):
        qs = qs.filter(trainer_id=request.GET["trainer_id"])
    return JsonResponse({"assignments": [_payroll_assignment_payload(assignment) for assignment in qs[:200]]})


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
        }
        return JsonResponse(payload, status=201)
    qs = PayrollPeriod.objects.order_by("-date_from", "-id")
    return JsonResponse({"periods": [_payroll_period_payload(period) for period in qs[:100]]})


@require_GET
def admin_payroll_period_detail(request, period_id):
    _admin_required(request)
    period = get_object_or_404(PayrollPeriod, pk=period_id)
    return JsonResponse(_payroll_period_payload(period, include_lines=True))
