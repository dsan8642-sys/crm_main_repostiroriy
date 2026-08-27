"""Module 5.6: scheduler with CONFIGURABLE timing (event_type + offset + channel +
template). Respects consent/unsubscribe, logs delivery with retries. No hardcoded offsets."""
from dataclasses import dataclass
from datetime import datetime, timedelta
import unicodedata
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import ConsentType
from billing.services import charge_statuses
from billing.models import Charge
from localization.services import default_language_code
from scheduling.models import Session
from students.models import Student
from subscriptions.models import Subscription, SubscriptionStatus

from .backends import BACKENDS, DeliveryError
from .models import (Channel, DeliveryStatus, EventType, NotificationLog,
                     NotificationRule, NotificationTemplate, QuietHoursPolicy,
                     SUPPORTED_NOTIFICATION_CHANNELS)

MAX_RETRIES = 3

CONSENT_FOR_CHANNEL = {
    Channel.EMAIL: ConsentType.EMAIL,
    Channel.SMS: ConsentType.SMS,
    Channel.TELEGRAM: ConsentType.TELEGRAM,
}


def channel_allowed(parent, channel) -> bool:
    """RODO: Email & SMS require an active consent. Telegram requires an active
    consent OR an implicit opt-in (chat_id present and not explicitly revoked)."""
    if channel not in SUPPORTED_NOTIFICATION_CHANNELS:
        return False
    ctype = CONSENT_FOR_CHANNEL.get(channel)
    consent = parent.consents.filter(type=ctype).first()
    if channel == Channel.TELEGRAM:
        revoked = consent is not None and not consent.is_active
        return bool(parent.telegram_chat_id) and not revoked
    return consent is not None and consent.is_active


class SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def _template_content(template: NotificationTemplate, language_code=None):
    language = (language_code or default_language_code()).lower()
    translation = template.translations.filter(language_code=language).first()
    if translation:
        return translation.subject, translation.body
    base_language = default_language_code()
    if language != base_language:
        translation = template.translations.filter(language_code=base_language).first()
        if translation:
            return translation.subject, translation.body
    return template.subject, template.body


def render(template: NotificationTemplate, context: dict, language_code=None):
    if template.channel == Channel.SMS:
        context = {key: _sms_safe(value) for key, value in context.items()}
    raw_subject, raw_body = _template_content(template, language_code)
    subject = (raw_subject or "").format_map(SafeDict(context))
    body = raw_body.format_map(SafeDict(context))
    return subject, body


def _sms_safe(value):
    text = str(value)
    text = text.replace("zł", "PLN").replace("ZŁ", "PLN").replace("ł", "l").replace("Ł", "L")
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


@dataclass
class Candidate:
    parent: object
    reference: datetime
    context: dict
    dedup_suffix: str


def _aware_midnight(d):
    return timezone.make_aware(datetime.combine(d, datetime.min.time()))


def _collect_payment_reminder(now):
    for st in Student.objects.filter(is_active=True).select_related("parent"):
        for cs in charge_statuses(st):
            if not cs.is_paid:
                ch = cs.charge
                yield Candidate(
                    parent=st.parent, reference=_aware_midnight(ch.due_date),
                    context={"student": st.full_name, "amount": ch.amount.format(),
                             "date": ch.due_date.strftime("%d.%m.%Y")},
                    dedup_suffix=f"charge{ch.id}")


def _collect_session_reminder(now):
    horizon = now + timedelta(days=14)
    for sess in Session.objects.filter(is_cancelled=False, start_at__gte=now,
                                        start_at__lte=horizon, group__isnull=False):
        for st in Student.objects.filter(groups=sess.group, is_active=True).select_related("parent"):
            yield Candidate(
                parent=st.parent, reference=sess.start_at,
                context={"student": st.full_name, "location": sess.location,
                         "date": timezone.localtime(sess.start_at).strftime("%d.%m.%Y %H:%M")},
                dedup_suffix=f"sess{sess.id}s{st.id}")


def _collect_subscription_end(now):
    for sub in (Subscription.objects
                .filter(status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN])
                .select_related("student__parent")):
        end = sub.effective_end_date
        yield Candidate(
            parent=sub.student.parent, reference=_aware_midnight(end),
            context={"student": sub.student.full_name, "date": end.strftime("%d.%m.%Y")},
            dedup_suffix=f"sub{sub.id}")


COLLECTORS = {
    EventType.PAYMENT_REMINDER: _collect_payment_reminder,
    EventType.SESSION_REMINDER: _collect_session_reminder,
    EventType.SUBSCRIPTION_END: _collect_subscription_end,
    EventType.RENEWAL_NEEDED: _collect_subscription_end,  # same anchor, different rule/offset
}


def enqueue(*, parent, event_type, channel, template, context, dedup_key):
    if not channel_allowed(parent, channel):
        return None
    try:
        with transaction.atomic():
            return NotificationLog.objects.create(
                recipient=parent, event_type=event_type, channel=channel,
                status=DeliveryStatus.QUEUED, payload=context, dedup_key=dedup_key,
                language_code=(getattr(parent, "preferred_language", "") or default_language_code()).lower())
    except IntegrityError:
        return None  # already queued/sent (idempotent)


def deliver(log: NotificationLog, template: NotificationTemplate):
    backend = BACKENDS.get(log.channel)
    if backend is None:
        log.retries += 1
        log.error = f"Unsupported notification channel: {log.channel}"
        log.status = DeliveryStatus.FAILED
        log.last_attempt_at = timezone.now()
        log.save(update_fields=["status", "last_attempt_at", "error", "retries"])
        return log
    if log.event_type == EventType.MASS_MAILING and "body" in log.payload:
        subject = log.payload.get("subject", "")
        body = log.payload["body"]
    else:
        if not log.language_code:
            log.language_code = (getattr(log.recipient, "preferred_language", "") or default_language_code()).lower()
        subject, body = render(template, log.payload, log.language_code)
    log.subject = subject or ""
    log.body = body or ""
    log.last_attempt_at = timezone.now()
    try:
        result = backend.send(parent=log.recipient, subject=subject, body=body) or {}
        log.status = DeliveryStatus.SENT
        log.sent_at = log.last_attempt_at
        log.error = ""
        log.provider_message_id = str(result.get("provider_message_id", "") or "")
    except (DeliveryError, Exception) as exc:  # noqa: BLE001 - record any failure
        log.retries += 1
        log.error = str(exc)
        log.status = DeliveryStatus.FAILED if log.retries >= MAX_RETRIES else DeliveryStatus.QUEUED
    log.save(update_fields=[
        "status", "sent_at", "last_attempt_at", "error", "retries",
        "subject", "body", "provider_message_id", "language_code",
    ])
    return log


def _quiet_window_end(policy, at):
    local_at = timezone.localtime(at, ZoneInfo(policy.timezone))
    current = local_at.time()
    starts = policy.starts_at
    ends = policy.ends_at

    if starts < ends:
        if starts <= current < ends:
            return local_at.replace(hour=ends.hour, minute=ends.minute, second=ends.second, microsecond=0)
        return None

    if current >= starts:
        next_day = local_at + timedelta(days=1)
        return next_day.replace(hour=ends.hour, minute=ends.minute, second=ends.second, microsecond=0)
    if current < ends:
        return local_at.replace(hour=ends.hour, minute=ends.minute, second=ends.second, microsecond=0)
    return None


def next_allowed_delivery_at(channel, at=None):
    """Return the earliest allowed delivery time for a channel."""
    candidate = at or timezone.now()
    policies = list(QuietHoursPolicy.objects.filter(channel=channel, is_active=True).order_by("id"))
    for _ in range(max(1, len(policies) * 2)):
        next_candidate = None
        for policy in policies:
            quiet_end = _quiet_window_end(policy, candidate)
            if quiet_end and (next_candidate is None or quiet_end > next_candidate):
                next_candidate = quiet_end
        if next_candidate is None or next_candidate <= candidate:
            return candidate
        candidate = next_candidate
    return candidate


def _defer_if_quiet(log, now):
    allowed_at = next_allowed_delivery_at(log.channel, now)
    if allowed_at <= now:
        return False
    log.status = DeliveryStatus.DEFERRED
    log.scheduled_at = allowed_at
    log.error = ""
    log.save(update_fields=["status", "scheduled_at", "error"])
    return True


def deliver_pending(now=None):
    """Deliver due QUEUED/DEFERRED logs and defer sends during quiet hours."""
    now = now or timezone.now()
    tmpl_cache = {}
    sent = failed = deferred = 0
    due_logs = NotificationLog.objects.filter(
        Q(status=DeliveryStatus.QUEUED) |
        Q(status=DeliveryStatus.DEFERRED, scheduled_at__lte=now)
    ).order_by("scheduled_at", "id")
    for log in due_logs:
        if _defer_if_quiet(log, now):
            deferred += 1
            continue
        key = (log.event_type, log.channel)
        tmpl = tmpl_cache.get(key) or NotificationTemplate.objects.filter(
            event_type=log.event_type, channel=log.channel).first()
        tmpl_cache[key] = tmpl
        if tmpl is None and log.event_type != EventType.MASS_MAILING:
            log.status = DeliveryStatus.FAILED
            log.error = "Нет шаблона для события/канала"
            log.save(update_fields=["status", "error"])
            failed += 1
            continue
        deliver(log, tmpl)
        if log.status == DeliveryStatus.SENT:
            sent += 1
        elif log.status == DeliveryStatus.FAILED:
            failed += 1
    return {"sent": sent, "failed": failed, "deferred": deferred}


def mass_mailing_recipients(*, audience, group_id=None, trainer_id=None, parent_ids=None):
    from accounts.models import ParentAccount

    qs = ParentAccount.objects.select_related("user").distinct()
    if audience == "all":
        return qs.filter(students__is_active=True).distinct()
    if audience == "group":
        return qs.filter(students__groups__id=group_id, students__is_active=True).distinct()
    if audience == "trainer":
        return qs.filter(students__groups__default_trainer_id=trainer_id,
                         students__is_active=True).distinct()
    if audience == "selected":
        return qs.filter(id__in=parent_ids or []).distinct()
    raise ValueError("Неизвестная аудитория рассылки")


def queue_mass_mailing(*, audience, channel, subject, body, group_id=None,
                       trainer_id=None, parent_ids=None, actor=None):
    """Module 5.7: queue a one-off personalized mass mailing with consent checks."""
    queued = 0
    skipped = 0
    campaign_key = timezone.now().strftime("%Y%m%d%H%M%S%f")
    for parent in mass_mailing_recipients(
            audience=audience, group_id=group_id, trainer_id=trainer_id,
            parent_ids=parent_ids):
        dedup = f"mass|{campaign_key}|{channel}|parent{parent.id}"
        context = {
            "subject": subject,
            "body": body.format_map(SafeDict({
                "parent": str(parent),
                "phone": parent.phone,
            })),
            "audience": audience,
            "created_by": getattr(actor, "id", None),
        }
        log = enqueue(parent=parent, event_type=EventType.MASS_MAILING,
                      channel=channel, template=None, context=context,
                      dedup_key=dedup)
        if log:
            queued += 1
        else:
            skipped += 1
    return {"queued": queued, "skipped": skipped}


def run_scheduler(now=None):
    """Enqueue all due notifications per active rules, then deliver. Idempotent."""
    now = now or timezone.now()
    enqueued = 0
    templates = {}
    for rule in NotificationRule.objects.filter(is_active=True).select_related("template"):
        collector = COLLECTORS.get(rule.event_type)
        if collector is None:
            continue
        for cand in collector(now):
            trigger = cand.reference + timedelta(minutes=rule.offset_minutes)
            if now < trigger:
                continue
            dedup = f"{rule.event_type}|{rule.channel}|{rule.offset_minutes}|{cand.dedup_suffix}"
            log = enqueue(parent=cand.parent, event_type=rule.event_type,
                          channel=rule.channel, template=rule.template,
                          context=cand.context, dedup_key=dedup)
            if log:
                enqueued += 1
    delivered = deliver_pending(now=now)
    return {"enqueued": enqueued, **delivered}


def notify_schedule_change(session, *, changed_by=None):
    """Event-driven (not polled): notify affected group's parents about a change.
    Uses the SCHEDULE_CHANGE templates/rules per channel that are active."""
    rules = NotificationRule.objects.filter(event_type=EventType.SCHEDULE_CHANGE,
                                             is_active=True).select_related("template")
    students = Student.objects.filter(groups=session.group, is_active=True).select_related("parent")
    count = 0
    for rule in rules:
        for st in students:
            ctx = {"student": st.full_name, "location": session.location,
                   "date": timezone.localtime(session.start_at).strftime("%d.%m.%Y %H:%M")}
            dedup = f"schedule_change|{rule.channel}|sess{session.id}s{st.id}|{timezone.now().date()}"
            if enqueue(parent=st.parent, event_type=EventType.SCHEDULE_CHANGE,
                       channel=rule.channel, template=rule.template, context=ctx,
                       dedup_key=dedup):
                count += 1
    deliver_pending()
    return count
