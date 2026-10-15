"""Rule 2 & 5: mark attendance, deduct sessions via the immutable ledger only,
enforce capacity + no double-enrollment with row locking against races."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from audit.models import audit
from billing.models import Charge
from students.models import Student
from subscriptions.models import (LedgerReason, SessionLedgerEntry,
                                  Subscription, SubscriptionStatus)
from subscriptions.services import can_assign_attendance
from scheduling.models import Session, SessionType
from scheduling.services import split_roster_student_ids

from .models import (AttendancePaymentSource, AttendanceRecord, AttendanceStatus,
                     DEDUCTING_STATUSES)


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


def attendance_payment(record):
    """Resolve the source for both historical and explicitly reassigned visits."""
    if not record.financial_effects_enabled or not record.deducts:
        return "none", None
    if record.payment_source:
        return record.payment_source, record.payment_subscription_id
    balances = {}
    for entry in record.ledger_entries.all():
        balances[entry.subscription_id] = balances.get(entry.subscription_id, 0) + entry.delta
    for subscription_id, balance in balances.items():
        if balance < 0:
            return AttendancePaymentSource.SUBSCRIPTION, subscription_id
    if sum(charge.amount_minor for charge in record.charges.all()) > 0:
        return AttendancePaymentSource.ACCOUNT, None
    for subscription in record.student.subscriptions.all():
        if (subscription.subscription_type.is_unlimited
                and subscription.is_active_on(record.session.start_at.date())):
            return AttendancePaymentSource.SUBSCRIPTION, subscription.id
    return "none", None


def _reconcile_explicit_payment(record, session, *, actor):
    subscription = record.payment_subscription
    desired = -1 if record.deducts and subscription and not subscription.subscription_type.is_unlimited else 0
    balances = dict(record.ledger_entries.values("subscription_id").annotate(
        total=Sum("delta")).values_list("subscription_id", "total"))
    if desired:
        balances.setdefault(subscription.id, 0)
    for subscription_id, current in balances.items():
        target = desired if subscription and subscription_id == subscription.id else 0
        if target != current:
            SessionLedgerEntry.objects.create(
                subscription_id=subscription_id, attendance=record,
                delta=target - current, reason=LedgerReason.CORRECTION,
                created_by=actor, note="Изменение источника списания / отметки посещения")
    _reconcile_visit_charge(
        record, session, covered_by_subscription=subscription is not None, actor=actor)


@transaction.atomic
def change_attendance_payment(*, student, attendance_ids, source, subscription_id=None, actor=None):
    """Reassign a participant's selected visits atomically; never create payments."""
    if source not in (AttendancePaymentSource.ACCOUNT, AttendancePaymentSource.SUBSCRIPTION):
        raise ValidationError("Выберите источник списания: счёт или абонемент.")
    # Match the session -> attendance -> participant lock order of set_attendance.
    session_ids = AttendanceRecord.objects.filter(
        student=student, pk__in=attendance_ids).values_list("session_id", flat=True)
    list(Session.objects.select_for_update().filter(pk__in=session_ids).order_by("pk"))
    records = list(AttendanceRecord.objects.select_for_update().filter(
        student=student, pk__in=attendance_ids).order_by("pk"))
    if not records or len(records) != len(attendance_ids):
        raise ValidationError("Выберите посещения одного участника.")
    student = Student.objects.select_for_update(no_key=True).get(pk=student.pk)
    if not student.is_active or (student.parent_id and not student.parent.user.is_active):
        raise ValidationError("Нельзя изменять посещения архивного клиента.")
    subscription = None
    if source == AttendancePaymentSource.SUBSCRIPTION:
        candidates = Subscription.objects.filter(student=student).exclude(
            status=SubscriptionStatus.CANCELLED)
        if subscription_id is None:
            ids = [candidate.pk for candidate in candidates.select_related(
                "subscription_type").prefetch_related("freeze_periods")
                if can_assign_attendance(candidate)]
            if len(ids) != 1:
                raise ValidationError("Выберите абонемент участника.")
            subscription_id = ids[0]
        subscription = candidates.select_related("subscription_type").filter(pk=subscription_id).first()
        if subscription is None:
            raise ValidationError("Абонемент недоступен или принадлежит другому участнику.")
        if not can_assign_attendance(subscription):
            raise ValidationError("Срок действия абонемента закончился и оставшихся занятий нет.")
    elif subscription_id is not None:
        raise ValidationError("Для списания со счёта абонемент не выбирается.")
    for record in records:
        if not record.deducts or record.session.is_cancelled:
            raise ValidationError("Источник списания можно изменить только у списываемых посещений.")
        if source == AttendancePaymentSource.ACCOUNT and record.session.price_minor is None:
            raise ValidationError("У занятия не сохранена стоимость для списания со счёта.")
        previous_source, previous_subscription_id = attendance_payment(record)
        previous_financial_effects = record.financial_effects_enabled
        record.payment_source = source
        record.payment_subscription = subscription
        record.financial_effects_enabled = True
        record.save(update_fields=["payment_source", "payment_subscription", "financial_effects_enabled"])
        _reconcile_explicit_payment(record, record.session, actor=actor)
        audit(actor, "attendance.payment_changed", record, {
            "previous_source": previous_source,
            "previous_subscription_id": previous_subscription_id,
            "source": source, "subscription_id": record.payment_subscription_id,
            "previous_financial_effects": previous_financial_effects,
            "financial_effects": True,
        })
    return records


def _reconcile_visit_charge(record, session, *, covered_by_subscription, actor):
    """Bill an attended session using its immutable price snapshot.

    Charges are append-only (Charge.delete() raises), so a status change away
    from a deducting status cannot remove the original row — it posts a negative reversal
    instead, mirroring how the ledger compensates with CORRECTION entries.
    """
    foreign_currency_charge = record.charges.exclude(currency=session.currency).exists()
    if foreign_currency_charge:
        raise ValidationError(
            "Visit charge currency conflicts with the session price snapshot")
    charged = record.charges.filter(currency=session.currency).aggregate(
        total=Sum("amount_minor"))["total"] or 0
    should_bill = (
        record.status in DEDUCTING_STATUSES
        and not covered_by_subscription
        and session.price_minor is not None
        and session.price_minor > 0
    )
    # A split session has one shared snapshot price. Every enrolled attendee
    # gets an equal, deterministic share; an odd minor-unit remainder stays
    # uncharged instead of silently overcharging anyone.
    divisor = (
        max(len(split_roster_student_ids(session)), 1)
        if session.session_type == SessionType.SPLIT else 1
    )
    desired = (session.price_minor // divisor) if should_bill else 0
    diff = desired - charged
    if diff == 0:
        return
    Charge.objects.create(
        student=record.student,
        attendance=record,
        description=(f"Разовое занятие · {session}" if diff > 0
                     else f"Сторно разового занятия · {session}"),
        amount_minor=diff,
        currency=session.currency,
        due_date=session.start_at.date(),
        created_by=actor,
    )


@transaction.atomic
def set_attendance(
        *, session_id, student, status, actor=None,
        apply_financial_effects=True, source="manual"):
    """Create or update the attendance record and reconcile the ledger (rule 1 & 2).

    - PRESENT / ABSENT  -> session consumed (net -1 against the ledger)
    - EXCUSED / RESCHEDULED / None -> not consumed (net 0)
    Status changes never edit past ledger rows; they post a compensating
    CORRECTION row so the journal stays append-only and transparent.
    """
    session = Session.objects.select_for_update().get(pk=session_id)
    if status is not None and status not in AttendanceStatus.values:
        raise ValidationError("Недопустимый статус посещения")
    if session.is_cancelled:
        raise ValidationError("Занятие отменено")
    if not student.is_active:
        raise ValidationError("archived participant cannot have attendance marked")
    if student.parent_id and not student.parent.user.is_active:
        raise ValidationError("archived client account cannot have attendance marked")

    record = AttendanceRecord.objects.select_for_update().filter(
        session=session, student=student).first()
    if status is None and (record is None or record.status is None):
        return record
    previous_status = record.status if record else None

    if record is None:
        # Rule 5: capacity check under the session row lock (race-safe).
        current_count = AttendanceRecord.objects.filter(session=session, status__isnull=False).count()
        if current_count >= session.max_participants:
            raise ValidationError(
                f"Превышен лимит участников занятия ({session.max_participants})")
        record = AttendanceRecord.objects.create(
            session=session,
            student=student,
            status=status,
            marked_by=actor,
            financial_effects_enabled=bool(apply_financial_effects),
        )
    else:
        record.status = status
        record.marked_by = actor
        record.save(update_fields=["status", "marked_by", "marked_at"])

    if not record.financial_effects_enabled:
        audit(actor, "attendance.cleared" if status is None else "attendance.marked", record, {
            "status": str(status),
            "previous_status": previous_status,
            "session": session_id,
            "source": source,
            "financial_effects": record.financial_effects_enabled,
        })
        return record

    # Different sessions share the participant's balance, not a session lock.
    Student.objects.select_for_update(no_key=True).get(pk=student.pk)
    if record.payment_source:
        _reconcile_explicit_payment(record, session, actor=actor)
        audit(actor, "attendance.cleared" if status is None else "attendance.marked", record, {
            "status": str(status), "previous_status": previous_status,
            "session": session_id, "source": source,
            "financial_effects": record.financial_effects_enabled,
        })
        return record
    desired = -1 if status in DEDUCTING_STATUSES else 0
    current = _current_effect(record)
    diff = desired - current
    existing = record.ledger_entries.select_related("subscription").first()
    sub = existing.subscription if existing else None
    unlimited_covers = sub is None and any(
        candidate.is_active_on(session.start_at.date())
        for candidate in Subscription.objects.filter(
            student=student, subscription_type__sessions_count__isnull=True,
            status__in=(SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN),
            start_date__lte=session.start_at.date(),
        ).prefetch_related("freeze_periods")
    )
    if diff != 0:
        # A status change reconciles against the SAME subscription the original
        # deduction hit (append-only compensation); a first-time deduction picks
        # a counted subscription that still has sessions left.
        if sub is None and not unlimited_covers:
            sub = _deductible_subscription(student, session.start_at.date())
        if sub is not None:  # unlimited / no sub with balance -> nothing to deduct
            reason = (LedgerReason.ATTENDANCE
                      if existing is None and desired == -1 else LedgerReason.CORRECTION)
            SessionLedgerEntry.objects.create(
                subscription=sub, delta=diff, reason=reason,
                attendance=record, created_by=actor,
                note=f"{record.get_status_display() if status is not None else 'Отметка снята'} · {session}")

    # A subscription that already absorbed this visit keeps absorbing it across
    # status changes. A valid unlimited subscription covers without a deduction.
    _reconcile_visit_charge(record, session,
                            covered_by_subscription=sub is not None or unlimited_covers,
                            actor=actor)
    audit(actor, "attendance.cleared" if status is None else "attendance.marked", record, {
        "status": str(status),
        "previous_status": previous_status,
        "session": session_id,
        "source": source,
        "financial_effects": record.financial_effects_enabled,
    })
    return record
