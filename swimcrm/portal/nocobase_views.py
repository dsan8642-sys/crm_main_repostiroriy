from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db.models import ProtectedError
from django.db.models import Q

from localization.models import DictionaryKey, DictionaryTranslation, Language
from notifications.models import (
    EventType, NotificationRule, NotificationTemplate,
    NotificationTemplateTranslation, QuietHoursPolicy,
    SUPPORTED_NOTIFICATION_CHANNELS,
)
from payroll.models import PayrollPeriod, PayrollRule, PayrollScheme, TrainerPayrollAssignment
from payroll.services import payroll_totals_by_trainer
from scheduling.models import Location, SessionTypeConfig

from .support import *
from .admin_support import _admin_required


def _nocobase_required(request):
    token = getattr(settings, "NOCOBASE_BRIDGE_TOKEN", "")
    if token:
        auth = request.headers.get("Authorization", "")
        direct = request.headers.get("X-NocoBase-Bridge-Token", "")
        if auth == f"Bearer {token}" or direct == token:
            return
        raise PermissionDenied("Invalid NocoBase bridge token")

    if not settings.DEBUG:
        raise PermissionDenied("NOCOBASE_BRIDGE_TOKEN is required")
    _admin_required(request)


def _nocobase_config_required(request):
    # The same configuration operations are now exposed in the SwimCRM admin UI.
    # A signed-in administrator must not need a separate bridge token or NocoBase UI.
    if getattr(request.user, "is_authenticated", False) and request.user.role == Role.ADMIN:
        return
    token = getattr(settings, "NOCOBASE_CONFIG_TOKEN", "")
    if token:
        auth = request.headers.get("Authorization", "")
        direct = request.headers.get("X-NocoBase-Config-Token", "")
        if auth == f"Bearer {token}" or direct == token:
            return
        raise PermissionDenied("Invalid NocoBase config token")

    if not settings.DEBUG:
        raise PermissionDenied("NOCOBASE_CONFIG_TOKEN is required")
    _admin_required(request)


def _audit_nocobase_config(instance, operation, changes=None):
    model_name = type(instance).__name__
    audit(
        None,
        f"nocobase_config.{model_name}.{operation}",
        instance,
        {"source": "nocobase_config_api", **(changes or {})},
    )


def _positive_int_query(request, name, default, max_value):
    raw = request.GET.get(name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{name} must be an integer") from exc
    if value < 1:
        raise ValidationError(f"{name} must be at least 1")
    return min(value, max_value)


def _optional_int_query(request, name):
    raw = request.GET.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{name} must be an integer") from exc


def _quiet_hours_config_payload(policy):
    return {
        "id": policy.id,
        "channel": policy.channel,
        "starts_at": policy.starts_at.isoformat(timespec="minutes"),
        "ends_at": policy.ends_at.isoformat(timespec="minutes"),
        "timezone": policy.timezone,
        "is_active": policy.is_active,
        "created_at": timezone.localtime(policy.created_at).isoformat() if policy.created_at else None,
    }


def _notification_template_config_payload(template):
    return {
        "id": template.id,
        "event_type": template.event_type,
        "channel": template.channel,
        "subject": template.subject,
        "body": template.body,
    }


def _apply_notification_template_config(template, data):
    data = data.get("template") or data
    for field in ("event_type", "channel", "subject", "body"):
        if field in data:
            setattr(template, field, data.get(field, "") or "")
    if template.event_type not in EventType.values:
        raise ValidationError("invalid event_type")
    if template.channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise ValidationError("invalid channel")
    if not template.body:
        raise ValidationError("body is required")
    template.full_clean()
    template.save()
    return template


def _notification_rule_config_payload(rule):
    return {
        "id": rule.id,
        "event_type": rule.event_type,
        "channel": rule.channel,
        "template_id": rule.template_id,
        "template": _notification_template_config_payload(rule.template),
        "offset_minutes": rule.offset_minutes,
        "is_active": rule.is_active,
    }


def _apply_notification_rule_config(rule, data):
    data = data.get("rule") or data
    for field in ("event_type", "channel"):
        if field in data:
            setattr(rule, field, data.get(field, "") or "")
    if "template_id" in data:
        rule.template = get_object_or_404(NotificationTemplate, pk=data.get("template_id"))
    if "offset_minutes" in data:
        try:
            rule.offset_minutes = int(data.get("offset_minutes"))
        except (TypeError, ValueError) as exc:
            raise ValidationError("offset_minutes must be an integer") from exc
    if "is_active" in data:
        rule.is_active = _bool_value(data.get("is_active"), True)
    if rule.event_type not in EventType.values:
        raise ValidationError("invalid event_type")
    if rule.channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise ValidationError("invalid channel")
    if not rule.template_id:
        raise ValidationError("template_id is required")
    rule.full_clean()
    rule.save()
    return rule


def _location_config_payload(location):
    return {
        "id": location.id,
        "code": location.code,
        "name": location.name,
        "address": location.address,
        "timezone": location.timezone,
        "is_active": location.is_active,
        "created_at": timezone.localtime(location.created_at).isoformat() if location.created_at else None,
        "updated_at": timezone.localtime(location.updated_at).isoformat() if location.updated_at else None,
    }


def _apply_location_config(location, data):
    data = data.get("location") or data
    if "code" in data:
        location.code = data.get("code", "") or ""
    if "name" in data:
        location.name = data.get("name", "") or ""
    if "address" in data:
        location.address = data.get("address", "") or ""
    if "timezone" in data:
        location.timezone = data.get("timezone", "") or "Europe/Warsaw"
    if "is_active" in data:
        location.is_active = _bool_value(data.get("is_active"), True)
    location.full_clean()
    location.save()
    return location


def _session_type_config_payload(session_type):
    return {
        "id": session_type.id,
        "code": session_type.code,
        "label": session_type.label,
        "default_capacity": session_type.default_capacity,
        "is_active": session_type.is_active,
        "created_at": timezone.localtime(session_type.created_at).isoformat() if session_type.created_at else None,
        "updated_at": timezone.localtime(session_type.updated_at).isoformat() if session_type.updated_at else None,
    }


def _apply_session_type_config(session_type, data):
    data = data.get("session_type") or data
    if "code" in data:
        session_type.code = data.get("code", "") or ""
    if "label" in data:
        session_type.label = data.get("label", "") or ""
    if "default_capacity" in data:
        value = data.get("default_capacity")
        session_type.default_capacity = None if value in (None, "") else int(value)
    if "is_active" in data:
        session_type.is_active = _bool_value(data.get("is_active"), True)
    session_type.full_clean()
    session_type.save()
    return session_type


def _payroll_calculation_read_payload(calc):
    return {
        "id": calc.id,
        "period_id": calc.period_id,
        "trainer_id": calc.trainer_id,
        "trainer": str(calc.trainer),
        "session_id": calc.session_id,
        "session_start_at": timezone.localtime(calc.session.start_at).isoformat(),
        "session_type": calc.session.session_type,
        "location": calc.session.location,
        "attended_clients_count": calc.attended_clients_count,
        "base_amount_minor": calc.base_amount_minor,
        "extra_clients_count": calc.extra_clients_count,
        "extra_amount_minor": calc.extra_amount_minor,
        "final_amount_minor": calc.final_amount_minor,
        "currency": calc.currency,
    }


def _payroll_period_read_payload(period, include_lines=False):
    payload = {
        "id": period.id,
        "date_from": period.date_from.isoformat(),
        "date_to": period.date_to.isoformat(),
        "location": period.location,
        "status": period.status,
        "totals_by_trainer": payroll_totals_by_trainer(period),
        "calculations_count": period.calculations.count(),
        "created_at": timezone.localtime(period.created_at).isoformat() if period.created_at else None,
        "updated_at": timezone.localtime(period.updated_at).isoformat() if period.updated_at else None,
    }
    if include_lines:
        calculations = period.calculations.select_related(
            "trainer__user", "session", "rule").order_by("session__start_at", "id")
        payload["calculations"] = [_payroll_calculation_read_payload(calc) for calc in calculations]
    return payload


def _language_config_payload(language):
    return {
        "id": language.id,
        "code": language.code,
        "name": language.name,
        "is_active": language.is_active,
    }


def _apply_language_config(language, data):
    data = data.get("language") or data
    if "code" in data:
        language.code = data.get("code", "") or ""
    if "name" in data:
        language.name = data.get("name", "") or ""
    if "is_active" in data:
        language.is_active = _bool_value(data.get("is_active"), True)
    language.full_clean()
    language.save()
    return language


def _dictionary_key_config_payload(key):
    return {
        "id": key.id,
        "domain": key.domain,
        "code": key.code,
        "is_active": key.is_active,
    }


def _apply_dictionary_key_config(key, data):
    data = data.get("key") or data
    if "domain" in data:
        key.domain = data.get("domain", "") or ""
    if "code" in data:
        key.code = data.get("code", "") or ""
    if "is_active" in data:
        key.is_active = _bool_value(data.get("is_active"), True)
    key.full_clean()
    key.save()
    return key


def _dictionary_translation_config_payload(translation):
    return {
        "id": translation.id,
        "key_id": translation.key_id,
        "domain": translation.key.domain,
        "code": translation.key.code,
        "language_code": translation.language_code,
        "value": translation.value,
        "created_at": timezone.localtime(translation.created_at).isoformat() if translation.created_at else None,
        "updated_at": timezone.localtime(translation.updated_at).isoformat() if translation.updated_at else None,
    }


def _apply_dictionary_translation_config(translation, data):
    data = data.get("translation") or data
    if "key_id" in data:
        translation.key = get_object_or_404(DictionaryKey, pk=data.get("key_id"))
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "value" in data:
        translation.value = data.get("value", "") or ""
    translation.full_clean()
    translation.save()
    return translation


def _notification_template_translation_config_payload(translation):
    return {
        "id": translation.id,
        "template_id": translation.template_id,
        "event_type": translation.template.event_type,
        "channel": translation.template.channel,
        "language_code": translation.language_code,
        "subject": translation.subject,
        "body": translation.body,
        "created_at": timezone.localtime(translation.created_at).isoformat() if translation.created_at else None,
        "updated_at": timezone.localtime(translation.updated_at).isoformat() if translation.updated_at else None,
    }


def _apply_notification_template_translation_config(translation, data):
    data = data.get("translation") or data
    if "template_id" in data:
        translation.template = get_object_or_404(NotificationTemplate, pk=data.get("template_id"))
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "subject" in data:
        translation.subject = data.get("subject", "") or ""
    if "body" in data:
        translation.body = data.get("body", "") or ""
    translation.full_clean()
    translation.save()
    return translation


def _apply_quiet_hours_config(policy, data):
    data = data.get("policy") or data
    if "channel" in data:
        policy.channel = data.get("channel", "") or ""
    if "starts_at" in data:
        policy.starts_at = _parse_time(data.get("starts_at"), "starts_at")
    if "ends_at" in data:
        policy.ends_at = _parse_time(data.get("ends_at"), "ends_at")
    if "timezone" in data:
        policy.timezone = data.get("timezone", "") or "Europe/Warsaw"
    if "is_active" in data:
        policy.is_active = _bool_value(data.get("is_active"), True)
    policy.full_clean()
    policy.save()
    return policy


def _payroll_scheme_config_payload(scheme):
    return {
        "id": scheme.id,
        "name": scheme.name,
        "location": scheme.location,
        "is_active": scheme.is_active,
        "created_at": timezone.localtime(scheme.created_at).isoformat() if scheme.created_at else None,
        "updated_at": timezone.localtime(scheme.updated_at).isoformat() if scheme.updated_at else None,
    }


def _apply_payroll_scheme_config(scheme, data):
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


def _payroll_rule_config_payload(rule):
    return {
        "id": rule.id,
        "scheme_id": rule.scheme_id,
        "scheme": rule.scheme.name,
        "session_type": rule.session_type,
        "rule_type": rule.rule_type,
        "base_amount_minor": rule.base_amount_minor,
        "currency": rule.currency,
        "min_clients_threshold": rule.min_clients_threshold,
        "extra_client_amount_minor": rule.extra_client_amount_minor,
        "is_active": rule.is_active,
        "created_at": timezone.localtime(rule.created_at).isoformat() if rule.created_at else None,
        "updated_at": timezone.localtime(rule.updated_at).isoformat() if rule.updated_at else None,
    }


def _apply_payroll_rule_config(rule, data):
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


def _payroll_assignment_config_payload(assignment):
    return {
        "id": assignment.id,
        "trainer_id": assignment.trainer_id,
        "trainer": str(assignment.trainer),
        "scheme_id": assignment.scheme_id,
        "scheme": assignment.scheme.name,
        "effective_from": assignment.effective_from.isoformat(),
        "effective_to": assignment.effective_to.isoformat() if assignment.effective_to else None,
        "created_at": timezone.localtime(assignment.created_at).isoformat() if assignment.created_at else None,
    }


def _apply_payroll_assignment_config(assignment, data):
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


def _latest_payment_payload(student):
    payment = student.payments.order_by("-paid_at", "-id").first()
    if not payment:
        return None
    return {
        "id": payment.id,
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
        "paid_at": payment.paid_at.isoformat(),
        "method": payment.method,
        "status": payment.status,
        "confirmed_at": timezone.localtime(payment.confirmed_at).isoformat() if payment.confirmed_at else None,
    }


def _active_subscription_payload(student):
    subscription = student.subscriptions.select_related("subscription_type").filter(
        status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN],
    ).order_by("-start_date", "-id").first()
    if not subscription:
        return None
    return {
        "id": subscription.id,
        "type": subscription.subscription_type.name,
        "status": subscription.status,
        "start_date": subscription.start_date.isoformat(),
        "base_end_date": subscription.base_end_date.isoformat(),
        "effective_end_date": subscription.effective_end_date.isoformat(),
        "grace_end_date": subscription.grace_end_date.isoformat(),
        "remaining_sessions": subscription.remaining_sessions,
    }


def _nocobase_client_row(student):
    balance = student_balance(student)
    charge_rows = charge_statuses(student)
    return {
        "participant_id": student.id,
        "client_id": student.parent_id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": student.full_name,
        "birth_date": student.birth_date.isoformat() if student.birth_date else None,
        "participant_email": student.email,
        "is_account_holder": student.is_account_holder,
        "is_active": student.is_active,
        "group": {"id": student.group_id, "name": student.group.name} if student.group else None,
        "parent": {
            "id": student.parent_id,
            "full_name": student.parent.user.get_full_name() or student.parent.user.username,
            "phone": student.parent.phone,
            "email": student.parent.email or student.parent.user.email,
            "telegram_chat_id": student.parent.telegram_chat_id,
            "preferred_language": student.parent.preferred_language,
        },
        "balance_minor": balance.amount_minor,
        "currency": balance.currency,
        "has_overdue_charge": any(row.is_overdue for row in charge_rows),
        "latest_payment": _latest_payment_payload(student),
        "active_subscription": _active_subscription_payload(student),
    }


@require_GET
def nocobase_health(request):
    _nocobase_required(request)
    return JsonResponse({
        "ok": True,
        "bridge": "swimcrm-django",
        "mode": "read-only",
        "config_api": bool(getattr(settings, "NOCOBASE_CONFIG_TOKEN", "")) or settings.DEBUG,
    })


@require_GET
def nocobase_ops_status(request):
    _nocobase_required(request)
    from common.ops_status import build_ops_status

    return JsonResponse(build_ops_status())


@require_GET
def nocobase_clients(request):
    _nocobase_required(request)
    qs = Student.objects.select_related("parent", "parent__user", "group").prefetch_related(
        "payments", "subscriptions", "subscriptions__subscription_type")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(
            Q(first_name__icontains=q) |
            Q(last_name__icontains=q) |
            Q(email__icontains=q) |
            Q(parent__phone__icontains=q) |
            Q(parent__email__icontains=q) |
            Q(parent__user__first_name__icontains=q) |
            Q(parent__user__last_name__icontains=q) |
            Q(group__name__icontains=q)
        )
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")

    limit = _positive_int_query(request, "limit", default=200, max_value=500)
    rows = [_nocobase_client_row(student) for student in qs.order_by("last_name", "first_name", "id")[:limit]]
    return JsonResponse({"clients": rows, "count": len(rows)})


@require_GET
def nocobase_debtors(request):
    _nocobase_required(request)
    rows = []
    for row in debtors():
        rows.append({
            "participant_id": row.student.id,
            "client_id": row.student.parent_id,
            "full_name": row.student.full_name,
            "group": row.student.group.name if row.student.group else None,
            "parent_phone": row.student.parent.phone,
            "parent_email": row.student.parent.email or row.student.parent.user.email,
            "reasons": row.reasons,
            "balance_minor": row.balance_minor,
            "currency": row.currency,
        })
    return JsonResponse({"debtors": rows, "count": len(rows)})


@require_GET
def nocobase_payroll_periods(request):
    _nocobase_required(request)
    qs = PayrollPeriod.objects.order_by("-date_from", "-id")
    if request.GET.get("location"):
        qs = qs.filter(location=request.GET["location"])
    if request.GET.get("status"):
        qs = qs.filter(status=request.GET["status"])
    return JsonResponse({"periods": [_payroll_period_read_payload(period) for period in qs[:100]]})


@require_GET
def nocobase_payroll_period_detail(request, period_id):
    _nocobase_required(request)
    period = get_object_or_404(PayrollPeriod, pk=period_id)
    return JsonResponse(_payroll_period_read_payload(period, include_lines=True))


@require_http_methods(["GET", "POST"])
def nocobase_config_quiet_hours(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        policy = _apply_quiet_hours_config(QuietHoursPolicy(), _json_body(request))
        _audit_nocobase_config(policy, "created")
        return JsonResponse(_quiet_hours_config_payload(policy), status=201)
    qs = QuietHoursPolicy.objects.order_by("channel", "starts_at", "id")
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"policies": [_quiet_hours_config_payload(policy) for policy in qs[:200]]})


@require_http_methods(["GET", "POST"])
def nocobase_config_notification_templates(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        template = _apply_notification_template_config(NotificationTemplate(), _json_body(request))
        _audit_nocobase_config(template, "created")
        return JsonResponse(_notification_template_config_payload(template), status=201)
    qs = NotificationTemplate.objects.order_by("event_type", "channel", "id")
    if request.GET.get("event_type"):
        qs = qs.filter(event_type=request.GET["event_type"])
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    return JsonResponse({"templates": [_notification_template_config_payload(template) for template in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_notification_template_detail(request, template_id):
    _nocobase_config_required(request)
    template = get_object_or_404(NotificationTemplate, pk=template_id)
    if request.method == "DELETE":
        try:
            template.delete()
        except ProtectedError as exc:
            raise ValidationError("notification template is used by active or archived rules") from exc
        _audit_nocobase_config(template, "deleted")
        return JsonResponse({"deleted": True, "id": template_id})
    if request.method != "GET":
        _apply_notification_template_config(template, _json_body(request))
        _audit_nocobase_config(template, "updated")
    return JsonResponse(_notification_template_config_payload(template))


@require_http_methods(["GET", "POST"])
def nocobase_config_notification_rules(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        rule = _apply_notification_rule_config(NotificationRule(), _json_body(request))
        _audit_nocobase_config(rule, "created")
        return JsonResponse(_notification_rule_config_payload(rule), status=201)
    qs = NotificationRule.objects.select_related("template").order_by(
        "event_type", "channel", "offset_minutes", "id")
    if request.GET.get("event_type"):
        qs = qs.filter(event_type=request.GET["event_type"])
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"rules": [_notification_rule_config_payload(rule) for rule in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_notification_rule_detail(request, rule_id):
    _nocobase_config_required(request)
    rule = get_object_or_404(NotificationRule.objects.select_related("template"), pk=rule_id)
    if request.method == "DELETE":
        rule.is_active = False
        rule.save(update_fields=["is_active"])
        _audit_nocobase_config(rule, "archived", {"is_active": False})
        return JsonResponse(_notification_rule_config_payload(rule))
    if request.method != "GET":
        _apply_notification_rule_config(rule, _json_body(request))
        _audit_nocobase_config(rule, "updated")
    return JsonResponse(_notification_rule_config_payload(rule))


@require_http_methods(["GET", "POST"])
def nocobase_config_locations(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        location = _apply_location_config(Location(), _json_body(request))
        _audit_nocobase_config(location, "created")
        return JsonResponse(_location_config_payload(location), status=201)
    qs = Location.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    if request.GET.get("q"):
        q = request.GET["q"]
        qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q) | Q(address__icontains=q))
    return JsonResponse({"locations": [_location_config_payload(location) for location in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_location_detail(request, location_id):
    _nocobase_config_required(request)
    location = get_object_or_404(Location, pk=location_id)
    if request.method == "DELETE":
        location.is_active = False
        location.save(update_fields=["is_active"])
        _audit_nocobase_config(location, "archived", {"is_active": False})
        return JsonResponse(_location_config_payload(location))
    if request.method != "GET":
        _apply_location_config(location, _json_body(request))
        _audit_nocobase_config(location, "updated")
    return JsonResponse(_location_config_payload(location))


@require_http_methods(["GET", "POST"])
def nocobase_config_session_types(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        session_type = _apply_session_type_config(SessionTypeConfig(), _json_body(request))
        _audit_nocobase_config(session_type, "created")
        return JsonResponse(_session_type_config_payload(session_type), status=201)
    qs = SessionTypeConfig.objects.order_by("code", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"session_types": [_session_type_config_payload(row) for row in qs[:50]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_session_type_detail(request, session_type_id):
    _nocobase_config_required(request)
    session_type = get_object_or_404(SessionTypeConfig, pk=session_type_id)
    if request.method == "DELETE":
        session_type.is_active = False
        session_type.save(update_fields=["is_active"])
        _audit_nocobase_config(session_type, "archived", {"is_active": False})
        return JsonResponse(_session_type_config_payload(session_type))
    if request.method != "GET":
        _apply_session_type_config(session_type, _json_body(request))
        _audit_nocobase_config(session_type, "updated")
    return JsonResponse(_session_type_config_payload(session_type))


@require_http_methods(["GET", "POST"])
def nocobase_config_languages(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        language = _apply_language_config(Language(), _json_body(request))
        _audit_nocobase_config(language, "created")
        return JsonResponse(_language_config_payload(language), status=201)
    qs = Language.objects.order_by("code", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"languages": [_language_config_payload(language) for language in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_language_detail(request, language_id):
    _nocobase_config_required(request)
    language = get_object_or_404(Language, pk=language_id)
    if request.method == "DELETE":
        language.is_active = False
        language.save(update_fields=["is_active"])
        _audit_nocobase_config(language, "archived", {"is_active": False})
        return JsonResponse(_language_config_payload(language))
    if request.method != "GET":
        _apply_language_config(language, _json_body(request))
        _audit_nocobase_config(language, "updated")
    return JsonResponse(_language_config_payload(language))


@require_http_methods(["GET", "POST"])
def nocobase_config_dictionary_keys(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        key = _apply_dictionary_key_config(DictionaryKey(), _json_body(request))
        _audit_nocobase_config(key, "created")
        return JsonResponse(_dictionary_key_config_payload(key), status=201)
    qs = DictionaryKey.objects.order_by("domain", "code", "id")
    if request.GET.get("domain"):
        qs = qs.filter(domain=request.GET["domain"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"keys": [_dictionary_key_config_payload(key) for key in qs[:500]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_dictionary_key_detail(request, key_id):
    _nocobase_config_required(request)
    key = get_object_or_404(DictionaryKey, pk=key_id)
    if request.method == "DELETE":
        key.is_active = False
        key.save(update_fields=["is_active"])
        _audit_nocobase_config(key, "archived", {"is_active": False})
        return JsonResponse(_dictionary_key_config_payload(key))
    if request.method != "GET":
        _apply_dictionary_key_config(key, _json_body(request))
        _audit_nocobase_config(key, "updated")
    return JsonResponse(_dictionary_key_config_payload(key))


@require_http_methods(["GET", "POST"])
def nocobase_config_dictionary_translations(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        translation = _apply_dictionary_translation_config(DictionaryTranslation(), _json_body(request))
        _audit_nocobase_config(translation, "created")
        return JsonResponse(_dictionary_translation_config_payload(translation), status=201)
    qs = DictionaryTranslation.objects.select_related("key").order_by("key__domain", "key__code", "language_code", "id")
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    if request.GET.get("domain"):
        qs = qs.filter(key__domain=request.GET["domain"])
    return JsonResponse({"translations": [_dictionary_translation_config_payload(row) for row in qs[:500]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_dictionary_translation_detail(request, translation_id):
    _nocobase_config_required(request)
    translation = get_object_or_404(DictionaryTranslation.objects.select_related("key"), pk=translation_id)
    if request.method == "DELETE":
        _audit_nocobase_config(translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        _apply_dictionary_translation_config(translation, _json_body(request))
        _audit_nocobase_config(translation, "updated")
    return JsonResponse(_dictionary_translation_config_payload(translation))


@require_http_methods(["GET", "POST"])
def nocobase_config_notification_template_translations(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        translation = _apply_notification_template_translation_config(
            NotificationTemplateTranslation(), _json_body(request))
        _audit_nocobase_config(translation, "created")
        return JsonResponse(_notification_template_translation_config_payload(translation), status=201)
    qs = NotificationTemplateTranslation.objects.select_related("template").order_by(
        "template__event_type", "template__channel", "language_code", "id")
    template_id = _optional_int_query(request, "template_id")
    if template_id is not None:
        qs = qs.filter(template_id=template_id)
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    return JsonResponse({
        "translations": [_notification_template_translation_config_payload(row) for row in qs[:500]],
    })


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_notification_template_translation_detail(request, translation_id):
    _nocobase_config_required(request)
    translation = get_object_or_404(
        NotificationTemplateTranslation.objects.select_related("template"), pk=translation_id)
    if request.method == "DELETE":
        _audit_nocobase_config(translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        _apply_notification_template_translation_config(translation, _json_body(request))
        _audit_nocobase_config(translation, "updated")
    return JsonResponse(_notification_template_translation_config_payload(translation))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_quiet_hours_detail(request, policy_id):
    _nocobase_config_required(request)
    policy = get_object_or_404(QuietHoursPolicy, pk=policy_id)
    if request.method == "DELETE":
        policy.is_active = False
        policy.save(update_fields=["is_active"])
        _audit_nocobase_config(policy, "archived", {"is_active": False})
        return JsonResponse(_quiet_hours_config_payload(policy))
    if request.method != "GET":
        _apply_quiet_hours_config(policy, _json_body(request))
        _audit_nocobase_config(policy, "updated")
    return JsonResponse(_quiet_hours_config_payload(policy))


@require_http_methods(["GET", "POST"])
def nocobase_config_payroll_schemes(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        scheme = _apply_payroll_scheme_config(PayrollScheme(), _json_body(request))
        _audit_nocobase_config(scheme, "created")
        return JsonResponse(_payroll_scheme_config_payload(scheme), status=201)
    qs = PayrollScheme.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"schemes": [_payroll_scheme_config_payload(scheme) for scheme in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_payroll_scheme_detail(request, scheme_id):
    _nocobase_config_required(request)
    scheme = get_object_or_404(PayrollScheme, pk=scheme_id)
    if request.method == "DELETE":
        scheme.is_active = False
        scheme.save(update_fields=["is_active"])
        _audit_nocobase_config(scheme, "archived", {"is_active": False})
        return JsonResponse(_payroll_scheme_config_payload(scheme))
    if request.method != "GET":
        _apply_payroll_scheme_config(scheme, _json_body(request))
        _audit_nocobase_config(scheme, "updated")
    return JsonResponse(_payroll_scheme_config_payload(scheme))


@require_http_methods(["GET", "POST"])
def nocobase_config_payroll_rules(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        rule = _apply_payroll_rule_config(PayrollRule(), _json_body(request))
        _audit_nocobase_config(rule, "created")
        return JsonResponse(_payroll_rule_config_payload(rule), status=201)
    qs = PayrollRule.objects.select_related("scheme").order_by("scheme__name", "session_type", "id")
    scheme_id = _optional_int_query(request, "scheme_id")
    if scheme_id is not None:
        qs = qs.filter(scheme_id=scheme_id)
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"rules": [_payroll_rule_config_payload(rule) for rule in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def nocobase_config_payroll_rule_detail(request, rule_id):
    _nocobase_config_required(request)
    rule = get_object_or_404(PayrollRule.objects.select_related("scheme"), pk=rule_id)
    if request.method == "DELETE":
        rule.is_active = False
        rule.save(update_fields=["is_active"])
        _audit_nocobase_config(rule, "archived", {"is_active": False})
        return JsonResponse(_payroll_rule_config_payload(rule))
    if request.method != "GET":
        _apply_payroll_rule_config(rule, _json_body(request))
        _audit_nocobase_config(rule, "updated")
    return JsonResponse(_payroll_rule_config_payload(rule))


@require_http_methods(["GET", "POST"])
def nocobase_config_payroll_assignments(request):
    _nocobase_config_required(request)
    if request.method == "POST":
        assignment = _apply_payroll_assignment_config(TrainerPayrollAssignment(), _json_body(request))
        _audit_nocobase_config(assignment, "created")
        return JsonResponse(_payroll_assignment_config_payload(assignment), status=201)
    qs = TrainerPayrollAssignment.objects.select_related(
        "trainer__user", "scheme").order_by("trainer_id", "-effective_from", "-id")
    trainer_id = _optional_int_query(request, "trainer_id")
    if trainer_id is not None:
        qs = qs.filter(trainer_id=trainer_id)
    return JsonResponse({"assignments": [_payroll_assignment_config_payload(assignment) for assignment in qs[:200]]})


__all__ = [
    "nocobase_health", "nocobase_ops_status", "nocobase_clients", "nocobase_debtors",
    "nocobase_payroll_periods", "nocobase_payroll_period_detail",
    "nocobase_config_notification_templates", "nocobase_config_notification_template_detail",
    "nocobase_config_notification_rules", "nocobase_config_notification_rule_detail",
    "nocobase_config_locations", "nocobase_config_location_detail",
    "nocobase_config_session_types", "nocobase_config_session_type_detail",
    "nocobase_config_languages", "nocobase_config_language_detail",
    "nocobase_config_dictionary_keys", "nocobase_config_dictionary_key_detail",
    "nocobase_config_dictionary_translations", "nocobase_config_dictionary_translation_detail",
    "nocobase_config_notification_template_translations",
    "nocobase_config_notification_template_translation_detail",
    "nocobase_config_quiet_hours", "nocobase_config_quiet_hours_detail",
    "nocobase_config_payroll_schemes", "nocobase_config_payroll_scheme_detail",
    "nocobase_config_payroll_rules", "nocobase_config_payroll_rule_detail",
    "nocobase_config_payroll_assignments",
]
