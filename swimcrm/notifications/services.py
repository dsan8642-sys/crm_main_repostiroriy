"""Module 5.6: scheduler with CONFIGURABLE timing (event_type + offset + channel +
template). Respects consent/unsubscribe, logs delivery with retries. No hardcoded offsets."""
from dataclasses import dataclass
from datetime import datetime, timedelta
import unicodedata

from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import ConsentType
from billing.services import charge_statuses
from billing.models import Charge
from scheduling.models import Session
from students.models import Student
from subscriptions.models import Subscription, SubscriptionStatus

from .backends import BACKENDS, DeliveryError
from .models import (Channel, DeliveryStatus, EventType, NotificationLog,
                     NotificationRule, NotificationTemplate)

MAX_RETRIES = 3

CONSENT_FOR_CHANNEL = {
    Channel.EMAIL: ConsentType.EMAIL,
    Channel.SMS: ConsentType.SMS,
    Channel.TELEGRAM: ConsentType.TELEGRAM,
}


def channel_allowed(parent, channel) -> bool:
    """RODO: Email & SMS require an active consent. Telegram requires an active
    consent OR an implicit opt-in (chat_id present and not explicitly revoked)."""
    ctype = CONSENT_FOR_CHANNEL.get(channel)
    if ctype is None:
        return True  # push handled elsewhere
    consent = parent.consents.filter(type=ctype).first()
    if channel == Channel.TELEGRAM:
        revoked = consent is not None and not consent.is_active
        return bool(parent.telegram_chat_id) and not revoked
    return consent is not None and consent.is_active


class SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render(template: NotificationTemplate, context: dict):
    if template.channel == Channel.SMS:
        context = {key: _sms_safe(value) for key, value in context.items()}
    subject = (template.subject or "").format_map(SafeDict(context))
    body = template.body.format_map(SafeDict(context))
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
        for st in Student.objects.filter(group=sess.group, is_active=True).select_related("parent"):
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
                status=DeliveryStatus.QUEUED, payload=context, dedup_key=dedup_key)
    except IntegrityError:
        return None  # already queued/sent (idempotent)


def deliver(log: NotificationLog, template: NotificationTemplate):
    backend = BACKENDS[log.channel]
    if log.event_type == EventType.MASS_MAILING and "body" in log.payload:
        subject = log.payload.get("subject", "")
        body = log.payload["body"]
    else:
        subject, body = render(template, log.payload)
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
        "subject", "body", "provider_message_id",
    ])
    return log


def deliver_pending():
    """Deliver every QUEUED log (also retries earlier soft failures)."""
    tmpl_cache = {}
    sent = failed = 0
    for log in NotificationLog.objects.filter(status=DeliveryStatus.QUEUED):
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
    return {"sent": sent, "failed": failed}


def mass_mailing_recipients(*, audience, group_id=None, trainer_id=None, parent_ids=None):
    from accounts.models import ParentAccount

    qs = ParentAccount.objects.select_related("user").distinct()
    if audience == "all":
        return qs.filter(students__is_active=True).distinct()
    if audience == "group":
        return qs.filter(students__group_id=group_id, students__is_active=True).distinct()
    if audience == "trainer":
        return qs.filter(students__group__default_trainer_id=trainer_id,
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
    delivered = deliver_pending()
    return {"enqueued": enqueued, **delivered}


def notify_schedule_change(session, *, changed_by=None):
    """Event-driven (not polled): notify affected group's parents about a change.
    Uses the SCHEDULE_CHANGE templates/rules per channel that are active."""
    rules = NotificationRule.objects.filter(event_type=EventType.SCHEDULE_CHANGE,
                                             is_active=True).select_related("template")
    students = Student.objects.filter(group=session.group, is_active=True).select_related("parent")
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
