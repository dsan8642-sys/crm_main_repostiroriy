from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload
from django.db.models import ProtectedError
from notifications.models import (DeliveryStatus, EventType, NotificationLog,
                                  NotificationRule, NotificationTemplate,
                                  QuietHoursPolicy,
                                  SUPPORTED_NOTIFICATION_CHANNELS)
from notifications.services import deliver, deliver_pending


def _template_payload(template):
    return {
        "id": template.id,
        "event_type": template.event_type,
        "channel": template.channel,
        "subject": template.subject,
        "body": template.body,
    }


def _rule_payload(rule):
    return {
        "id": rule.id,
        "event_type": rule.event_type,
        "channel": rule.channel,
        "template_id": rule.template_id,
        "template": _template_payload(rule.template),
        "offset_minutes": rule.offset_minutes,
        "is_active": rule.is_active,
    }


def _quiet_hours_payload(policy):
    return {
        "id": policy.id,
        "channel": policy.channel,
        "starts_at": policy.starts_at.isoformat(timespec="minutes"),
        "ends_at": policy.ends_at.isoformat(timespec="minutes"),
        "timezone": policy.timezone,
        "is_active": policy.is_active,
        "created_at": timezone.localtime(policy.created_at).isoformat() if policy.created_at else None,
    }


def _log_payload(log):
    return {
        "id": log.id,
        "recipient_id": log.recipient_id,
        "recipient": str(log.recipient),
        "event_type": log.event_type,
        "channel": log.channel,
        "status": log.status,
        "retries": log.retries,
        "error": log.error,
        "payload": log.payload,
        "subject": log.subject,
        "body": log.body,
        "provider_message_id": log.provider_message_id,
        "scheduled_at": timezone.localtime(log.scheduled_at).isoformat() if log.scheduled_at else None,
        "dedup_key": log.dedup_key,
        "created_at": timezone.localtime(log.created_at).isoformat() if log.created_at else None,
        "last_attempt_at": timezone.localtime(log.last_attempt_at).isoformat() if log.last_attempt_at else None,
        "sent_at": timezone.localtime(log.sent_at).isoformat() if log.sent_at else None,
        "delivered_at": timezone.localtime(log.delivered_at).isoformat() if log.delivered_at else None,
    }


def _apply_template_data(template, data):
    data = data.get("template") or data
    for field in ("event_type", "channel", "subject", "body"):
        if field in data:
            setattr(template, field, data.get(field, "") or "")
    if template.event_type not in EventType.values:
        raise _field_validation_error(
            "event_type", "Выберите допустимое событие.",
            code="invalid_choice")
    if template.channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise _field_validation_error(
            "channel", "Выберите допустимый канал.",
            code="invalid_choice")
    if not template.body:
        raise _field_validation_error(
            "body", "Введите текст уведомления.", code="required")
    template.full_clean()
    template.save()
    return template


def _apply_rule_data(rule, data):
    data = data.get("rule") or data
    for field in ("event_type", "channel"):
        if field in data:
            setattr(rule, field, data.get(field, "") or "")
    if "template_id" in data:
        rule.template = _object_for_field(
            NotificationTemplate.objects.all(), data.get("template_id"),
            "template_id", "шаблон")
    if "offset_minutes" in data:
        try:
            rule.offset_minutes = int(data.get("offset_minutes"))
        except (TypeError, ValueError) as exc:
            raise _field_validation_error(
                "offset_minutes", "Введите целое количество минут.",
                code="invalid_integer") from exc
    if "is_active" in data:
        rule.is_active = _bool_value(data.get("is_active"), True)
    if rule.event_type not in EventType.values:
        raise _field_validation_error(
            "event_type", "Выберите допустимое событие.",
            code="invalid_choice")
    if rule.channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise _field_validation_error(
            "channel", "Выберите допустимый канал.",
            code="invalid_choice")
    if not rule.template_id:
        raise _field_validation_error(
            "template_id", "Выберите шаблон.", code="required")
    rule.full_clean()
    rule.save()
    return rule


def _apply_quiet_hours_data(policy, data):
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


@require_http_methods(["GET", "POST"])
def admin_notification_templates(request):
    _admin_required(request)
    if request.method == "POST":
        template = _apply_template_data(NotificationTemplate(), _json_body(request))
        return JsonResponse(_template_payload(template), status=201)
    qs = NotificationTemplate.objects.order_by("event_type", "channel", "id")
    if request.GET.get("event_type"):
        qs = qs.filter(event_type=request.GET["event_type"])
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    return JsonResponse(paginated_payload(
        request, qs, key="templates", serializer=_template_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_notification_template_detail(request, template_id):
    _admin_required(request)
    template = get_object_or_404(NotificationTemplate, pk=template_id)
    if request.method == "DELETE":
        try:
            template.delete()
        except ProtectedError as exc:
            raise ValidationError("notification template is used by active or archived rules") from exc
        return JsonResponse({"ok": True})
    if request.method != "GET":
        _apply_template_data(template, _json_body(request))
    return JsonResponse(_template_payload(template))


@require_http_methods(["GET", "POST"])
def admin_notification_rules(request):
    _admin_required(request)
    if request.method == "POST":
        rule = _apply_rule_data(NotificationRule(), _json_body(request))
        return JsonResponse(_rule_payload(rule), status=201)
    qs = NotificationRule.objects.select_related("template").order_by("event_type", "channel", "offset_minutes", "id")
    if request.GET.get("event_type"):
        qs = qs.filter(event_type=request.GET["event_type"])
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="rules", serializer=_rule_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_notification_rule_detail(request, rule_id):
    _admin_required(request)
    rule = get_object_or_404(NotificationRule.objects.select_related("template"), pk=rule_id)
    if request.method == "DELETE":
        rule.is_active = False
        rule.save(update_fields=["is_active"])
        return JsonResponse(_rule_payload(rule))
    if request.method != "GET":
        _apply_rule_data(rule, _json_body(request))
    return JsonResponse(_rule_payload(rule))


@require_http_methods(["GET", "POST"])
def admin_quiet_hours_policies(request):
    _admin_required(request)
    if request.method == "POST":
        policy = _apply_quiet_hours_data(QuietHoursPolicy(), _json_body(request))
        return JsonResponse(_quiet_hours_payload(policy), status=201)
    qs = QuietHoursPolicy.objects.order_by("channel", "starts_at", "id")
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="policies", serializer=_quiet_hours_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_quiet_hours_policy_detail(request, policy_id):
    _admin_required(request)
    policy = get_object_or_404(QuietHoursPolicy, pk=policy_id)
    if request.method == "DELETE":
        policy.is_active = False
        policy.save(update_fields=["is_active"])
        return JsonResponse(_quiet_hours_payload(policy))
    if request.method != "GET":
        _apply_quiet_hours_data(policy, _json_body(request))
    return JsonResponse(_quiet_hours_payload(policy))


@require_GET
def admin_notification_logs(request):
    _admin_required(request)
    qs = NotificationLog.objects.select_related("recipient", "recipient__user").order_by("-created_at", "-id")
    if request.GET.get("status"):
        qs = qs.filter(status=request.GET["status"])
    if request.GET.get("channel"):
        qs = qs.filter(channel=request.GET["channel"])
    if request.GET.get("event_type"):
        qs = qs.filter(event_type=request.GET["event_type"])
    if request.GET.get("client_id"):
        qs = qs.filter(recipient_id=request.GET["client_id"])
    return JsonResponse({"logs": [_log_payload(log) for log in qs[:300]]})


@require_GET
def admin_notification_log_detail(request, log_id):
    _admin_required(request)
    log = get_object_or_404(NotificationLog.objects.select_related("recipient", "recipient__user"), pk=log_id)
    return JsonResponse(_log_payload(log))


@require_POST
def admin_notification_retry(request, log_id):
    _admin_required(request)
    log = get_object_or_404(NotificationLog.objects.select_related("recipient", "recipient__user"), pk=log_id)
    if log.status not in {DeliveryStatus.QUEUED, DeliveryStatus.FAILED}:
        raise ValidationError("only queued or failed notifications can be retried")
    log.status = DeliveryStatus.QUEUED
    log.save(update_fields=["status"])
    if log.event_type == EventType.MASS_MAILING and "body" in log.payload:
        deliver(log, None)
    else:
        deliver_pending()
        log.refresh_from_db()
    return JsonResponse(_log_payload(log))


@require_POST
def admin_mass_mail(request):
    user = _admin_required(request)
    data = _json_body(request)
    client_ids = data.get("client_ids")
    if client_ids is None:
        client_ids = data.get("parent_ids") or []
    channel = data.get("channel")
    if channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise _field_validation_error(
            "channel", "Выберите допустимый канал рассылки.",
            code="invalid_choice")
    if not data.get("body"):
        raise _field_validation_error(
            "body", "Введите текст сообщения.", code="required")
    result = queue_mass_mailing(
        audience=data.get("audience", "all"),
        channel=channel,
        subject=data.get("subject", ""),
        body=data["body"],
        group_id=data.get("group_id"),
        trainer_id=data.get("trainer_id"),
        parent_ids=client_ids,
        actor=user,
    )
    return JsonResponse(result, status=201)
