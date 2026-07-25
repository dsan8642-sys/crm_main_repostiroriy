"""Rule 2 & 5: mark attendance, deduct sessions via the immutable ledger only,
enforce capacity + no double-enrollment with row locking against races."""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from audit.models import audit
from billing.models import Charge
from subscriptions.models import (LedgerReason, SessionLedgerEntry,
                                  Subscription, SubscriptionStatus)
from scheduling.models import Session

from .models import AttendanceRecord, AttendanceStatus, DEDUCTING_STATUSES


def _deductible_subscription(student, when):
    """Pick a counted (non-unlimited) subscription to deduct a session from, or None.

    Decision #1: sessions never expire, so a subscription that is past its end
    date but still has a positive balance remains usable. We therefore select by
    *remaining balance*, not by date, and consume older subscriptions first
    (oldest base_end_date). Cancelled subscriptions are excluded.
    """
    for sub in (Subscription.objects
                .filter(student=student)
                .exclude(status=SubscriptionStatus.CANCELLED)
                .select_related("subscription_type")
                .order_by("base_end_date", "id")):
        if sub.subscription_type.is_unlimited:
            continue
        if (sub.remaining_sessions or 0) > 0:
            return sub
    return None


def _current_effect(record):
    agg = record.ledger_entries.aggregate(total=Sum("delta"))
    return agg["total"] or 0


def _reconcile_visit_charge(record, session, *, covered_by_subscription, actor):
    """Bill an attended session that no subscription paid for (rule: group price).

    Charges are append-only (Charge.delete() raises), so a status change away
    from PRESENT cannot remove the original row — it posts a negative reversal
    instead, mirroring how the ledger compensates with CORRECTION entries.
    """
    group = session.group
    charged = record.charges.aggregate(total=Sum("amount_minor"))["total"] or 0
    should_bill = (
        record.status == AttendanceStatus.PRESENT
        and not covered_by_subscription
        and group is not None
        and group.price_minor
    )
    desired = group.price_minor if should_bill else 0
    diff = desired - charged
    if diff == 0:
        return
    currency = group.currency if group is not None else settings.DEFAULT_CURRENCY
    Charge.objects.create(
        student=record.student,
        attendance=record,
        description=(f"Разовое занятие · {session}" if diff > 0
                     else f"Сторно разового занятия · {session}"),
        amount_minor=diff,
        currency=currency,
        due_date=session.start_at.date(),
        created_by=actor,
    )


@transaction.atomic
def set_attendance(*, session_id, student, status, actor=None):
    """Create or update the attendance record and reconcile the ledger (rule 1 & 2).

    - PRESENT / ABSENT  -> session consumed (net -1 against the ledger)
    - EXCUSED / RESCHEDULED -> not consumed (net 0)
    Status changes never edit past ledger rows; they post a compensating
    CORRECTION row so the journal stays append-only and transparent.
    """
    session = Session.objects.select_for_update().get(pk=session_id)
    if session.is_cancelled:
        raise ValidationError("Занятие отменено")
    if not student.is_active:
        raise ValidationError("archived participant cannot have attendance marked")
    if student.parent_id and not student.parent.user.is_active:
        raise ValidationError("archived client account cannot have attendance marked")

    record = AttendanceRecord.objects.select_for_update().filter(
        session=session, student=student).first()

    if record is None:
        # Rule 5: capacity check under the session row lock (race-safe).
        current_count = AttendanceRecord.objects.filter(session=session).count()
        if current_count >= session.max_participants:
            raise ValidationError(
                f"Превышен лимит участников занятия ({session.max_participants})")
        record = AttendanceRecord.objects.create(
            session=session, student=student, status=status, marked_by=actor)
    else:
        record.status = status
        record.marked_by = actor
        record.save(update_fields=["status", "marked_by", "marked_at"])

    desired = -1 if status in DEDUCTING_STATUSES else 0
    current = _current_effect(record)
    diff = desired - current
    existing = record.ledger_entries.select_related("subscription").first()
    sub = existing.subscription if existing else None
    if diff != 0:
        # A status change reconciles against the SAME subscription the original
        # deduction hit (append-only compensation); a first-time deduction picks
        # a counted subscription that still has sessions left.
        if sub is None:
            sub = _deductible_subscription(student, session.start_at.date())
        if sub is not None:  # unlimited / no sub with balance -> nothing to deduct
            reason = (LedgerReason.ATTENDANCE
                      if existing is None and desired == -1 else LedgerReason.CORRECTION)
            SessionLedgerEntry.objects.create(
                subscription=sub, delta=diff, reason=reason,
                attendance=record, created_by=actor,
                note=f"{record.get_status_display()} · {session}")

    # A subscription that already absorbed this visit keeps absorbing it across
    # status changes, so bill money only when no subscription ever covered it.
    _reconcile_visit_charge(record, session, covered_by_subscription=sub is not None,
                            actor=actor)
    audit(actor, "attendance.marked", record,
          {"status": str(status), "session": session_id})
    return record
