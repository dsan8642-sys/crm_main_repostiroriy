"""Rules 1 & 3: subscription creation posts +N to the ledger; freeze extends the end date."""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from audit.models import audit

from .models import (FreezePeriod, LedgerReason, SessionLedgerEntry,
                     Subscription, SubscriptionStatus)


@transaction.atomic
def create_subscription(*, student, subscription_type, start_date, created_by=None):
    """Create a subscription and post the initial +N ledger entry (rule 1)."""
    sub = Subscription.objects.create(
        student=student,
        subscription_type=subscription_type,
        start_date=start_date,
        base_end_date=start_date + timedelta(days=subscription_type.duration_days),
        status=SubscriptionStatus.ACTIVE,
    )
    if not subscription_type.is_unlimited:
        SessionLedgerEntry.objects.create(
            subscription=sub,
            delta=subscription_type.sessions_count,
            reason=LedgerReason.PURCHASE,
            created_by=created_by,
            note=f"Покупка: {subscription_type.name}",
        )
    audit(created_by, "subscription.created", sub, {"type": subscription_type.name})
    return sub


@transaction.atomic
def renew_subscription(*, subscription, subscription_type=None, start_date=None, created_by=None):
    """Decision #1: renew a subscription — remaining sessions never burn, they
    carry over into the new one (they accumulate).

    Creates a new Subscription (default: same type) and, if the old one was
    counted with a non-zero balance, moves that balance across with paired
    append-only CARRYOVER entries: the old ledger is zeroed, the new one is
    credited. Balance stays consistent per subscription and the journal remains
    immutable. The old subscription is marked EXPIRED (superseded).

    If the new type is unlimited, finite leftovers are moot — the old ledger is
    just zeroed (nothing to carry into a counter-less subscription).
    """
    subscription_type = subscription_type or subscription.subscription_type
    start_date = start_date or timezone.localdate()

    remaining = 0
    if not subscription.subscription_type.is_unlimited:
        remaining = subscription.remaining_sessions or 0

    new_sub = create_subscription(
        student=subscription.student, subscription_type=subscription_type,
        start_date=start_date, created_by=created_by)

    if remaining != 0:
        SessionLedgerEntry.objects.create(
            subscription=subscription, delta=-remaining, reason=LedgerReason.CARRYOVER,
            created_by=created_by,
            note=f"Перенос остатка при продлении → абонемент #{new_sub.id}")
        if not subscription_type.is_unlimited:
            SessionLedgerEntry.objects.create(
                subscription=new_sub, delta=remaining, reason=LedgerReason.CARRYOVER,
                created_by=created_by,
                note=f"Перенос остатка с абонемента #{subscription.id}")
        # else: new sub is unlimited -> leftover simply retired with the old one.

    subscription.status = SubscriptionStatus.EXPIRED
    subscription.save(update_fields=["status"])

    audit(created_by, "subscription.renewed", new_sub,
          {"from": subscription.id, "carried": remaining, "type": subscription_type.name})
    return new_sub


@transaction.atomic
def freeze_subscription(*, subscription, start_date, end_date, created_by=None, reason=""):
    """Rule 3: add a freeze interval. End date shifts by the interval length; history kept."""
    fp = FreezePeriod(subscription=subscription, start_date=start_date,
                      end_date=end_date, reason=reason, created_by=created_by)
    fp.full_clean(exclude=["created_by"])
    fp.save()
    audit(created_by, "subscription.frozen", subscription,
          {"from": str(start_date), "to": str(end_date), "reason": reason})
    return fp


@transaction.atomic
def manual_adjust(*, subscription, delta, created_by=None, note=""):
    """Rule 1: admin correction is a separate ledger row, not an edit."""
    if delta == 0:
        raise ValidationError("Корректировка на 0 не имеет смысла")
    entry = SessionLedgerEntry.objects.create(
        subscription=subscription, delta=delta, reason=LedgerReason.MANUAL,
        created_by=created_by, note=note)
    audit(created_by, "ledger.adjusted", subscription, {"delta": delta, "note": note})
    return entry
