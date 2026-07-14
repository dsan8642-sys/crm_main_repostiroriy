from .support import *
from .admin_support import _admin_required
from notifications.models import (DeliveryStatus, EventType, NotificationLog,
                                  NotificationRule, NotificationTemplate,
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
        raise ValidationError("invalid event_type")
    if template.channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        raise ValidationError("invalid channel")
    if not template.body:
        raise ValidationError("body is required")
    template.full_clean()
    template.save()
    return template


def _apply_rule_data(rule, data):
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
    return JsonResponse({"templates": [_template_payload(template) for template in qs[:200]]})


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_notification_template_detail(request, template_id):
    _admin_required(request)
    template = get_object_or_404(NotificationTemplate, pk=template_id)
    if request.method == "DELETE":
        template.delete()
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
    return JsonResponse({"rules": [_rule_payload(rule) for rule in qs[:200]]})


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
        raise ValidationError("invalid mailing channel")
    if not data.get("body"):
        raise ValidationError("body is required")
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
