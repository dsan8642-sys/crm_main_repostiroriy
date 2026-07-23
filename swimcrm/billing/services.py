"""Rules 8, 9, 10: balance from charges minus confirmed payments; payment workflow;
receipt auto-deletion. Accounting method: cash basis (confirmed payments)."""
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from audit.models import audit
from common.money import Money

from .models import (
    Charge, Payment, PaymentEvent, PaymentEventType, PaymentMethod,
    PaymentSource, PaymentStatus, ReceiptFile,
)


@dataclass
class ChargeStatus:
    charge: Charge
    paid_minor: int
    is_overdue: bool

    @property
    def is_paid(self):
        return self.paid_minor >= self.charge.amount_minor

    @property
    def is_partial(self):
        return 0 < self.paid_minor < self.charge.amount_minor

    @property
    def label(self):
        if self.is_paid:
            return "Оплачено"
        if self.is_partial:
            return "Частично оплачено"
        return "Просрочено" if self.is_overdue else "Ожидает оплаты"


def student_balance(student, currency=None) -> Money:
    """Rule 8: balance = SUM(charges) - SUM(confirmed payments). Never from payments alone."""
    currency = currency or settings.DEFAULT_CURRENCY
    charged = (Charge.objects.filter(student=student, currency=currency)
               .aggregate(t=Sum("amount_minor"))["t"] or 0)
    paid = (Payment.objects.filter(student=student, currency=currency,
                                   status=PaymentStatus.CONFIRMED)
            .aggregate(t=Sum("amount_minor"))["t"] or 0)
    return Money(charged - paid, currency)


def charge_statuses(student, currency=None):
    """FIFO-allocate confirmed payments to charges (by due date) for per-charge status."""
    currency = currency or settings.DEFAULT_CURRENCY
    today = timezone.localdate()
    charges = list(Charge.objects.filter(student=student, currency=currency).order_by("due_date", "id"))
    pool = (Payment.objects.filter(student=student, currency=currency,
                                   status=PaymentStatus.CONFIRMED)
            .aggregate(t=Sum("amount_minor"))["t"] or 0)
    out = []
    for ch in charges:
        applied = min(pool, ch.amount_minor)
        pool -= applied
        out.append(ChargeStatus(charge=ch, paid_minor=applied,
                                is_overdue=(ch.due_date < today and applied < ch.amount_minor)))
    return out


def _validate_payment_amount(amount_minor):
    try:
        amount_minor = int(amount_minor)
    except (TypeError, ValueError):
        raise ValidationError("amount_minor must be a positive integer") from None
    if amount_minor <= 0:
        raise ValidationError("Payment amount must be greater than zero")
    return amount_minor


def _record_payment_event(payment, event_type, actor, from_status="", note=""):
    return PaymentEvent.objects.create(
        payment=payment,
        event_type=event_type,
        actor=actor,
        from_status=from_status,
        to_status=payment.status,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        note=note or "",
    )


def _sync_payment_instance(target, source):
    """Keep callers holding the pre-lock instance compatible with service updates."""
    for field in ("status", "confirmed_by", "confirmed_by_id", "confirmed_at", "comment"):
        setattr(target, field, getattr(source, field))


@transaction.atomic
def create_client_top_up_request(
        *, student, account, actor, amount_minor, currency, paid_at, file, comment=""):
    """Create a pending bank-transfer request; never credit the balance here."""
    amount_minor = _validate_payment_amount(amount_minor)
    try:
        Money(amount_minor, currency)
    except (TypeError, ValueError) as exc:
        raise ValidationError(str(exc)) from exc

    payment = Payment.objects.create(
        student=student,
        amount_minor=amount_minor,
        currency=currency,
        paid_at=paid_at,
        method=PaymentMethod.TRANSFER,
        comment=comment or "",
        status=PaymentStatus.PENDING,
        source=PaymentSource.CLIENT_TOP_UP,
        created_by=actor,
    )
    receipt = ReceiptFile(
        payment=payment,
        uploaded_by=account,
        file=file,
        original_name=getattr(file, "name", ""),
    )
    receipt.full_clean(exclude=["payment", "uploaded_by"])
    receipt.save()
    _record_payment_event(payment, PaymentEventType.REQUESTED, actor)
    audit(actor, "payment.top_up_requested", payment, {
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
    })
    return payment, receipt


def record_admin_payment_created(payment, actor):
    _record_payment_event(payment, PaymentEventType.CREATED, actor)
    audit(actor, "payment.created", payment, {"status": payment.status})


@transaction.atomic
def confirm_payment(payment: Payment, admin):
    """Rule 9: admin verifies -> Confirmed. Only now does it affect balance."""
    original = payment
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == PaymentStatus.CONFIRMED:
        _sync_payment_instance(original, payment)
        return payment
    if payment.status != PaymentStatus.PENDING:
        raise ValidationError("Only a pending payment can be confirmed")
    previous_status = payment.status
    payment.status = PaymentStatus.CONFIRMED
    payment.confirmed_by = admin
    payment.confirmed_at = timezone.now()
    payment.save(update_fields=["status", "confirmed_by", "confirmed_at"])
    payment.receipts.update(decided_at=timezone.now())
    _record_payment_event(
        payment, PaymentEventType.CONFIRMED, admin, from_status=previous_status)
    audit(admin, "payment.confirmed", payment,
          {"amount_minor": payment.amount_minor, "currency": payment.currency})
    _sync_payment_instance(original, payment)
    return payment


@transaction.atomic
def reject_payment(payment: Payment, admin, reason=""):
    original = payment
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == PaymentStatus.REJECTED:
        _sync_payment_instance(original, payment)
        return payment
    if payment.status != PaymentStatus.PENDING:
        raise ValidationError("Only a pending payment can be rejected")
    previous_status = payment.status
    payment.status = PaymentStatus.REJECTED
    payment.confirmed_by = admin
    payment.confirmed_at = timezone.now()
    if reason:
        payment.comment = (payment.comment + f"\nОтклонено: {reason}").strip()
    payment.save(update_fields=["status", "confirmed_by", "confirmed_at", "comment"])
    payment.receipts.update(decided_at=timezone.now())
    _record_payment_event(
        payment, PaymentEventType.REJECTED, admin,
        from_status=previous_status, note=reason)
    audit(admin, "payment.rejected", payment, {"reason": reason})
    _sync_payment_instance(original, payment)
    return payment


def purge_expired_receipts(now=None, retention_days=None):
    """Rule 10: daily background job. Scrub receipt files older than N days.
    The Payment record is preserved with its 'confirmed by admin X, date' stamp."""
    now = now or timezone.now()
    retention_days = retention_days or settings.RECEIPT_RETENTION_DAYS
    cutoff = now - timedelta(days=retention_days)
    scrubbed = 0
    for rf in ReceiptFile.objects.filter(is_deleted=False):
        if rf.retention_anchor <= cutoff:
            if rf.file:
                rf.file.delete(save=False)  # remove the sensitive blob
            rf.file = None
            rf.is_deleted = True
            rf.deleted_at = now
            rf.save(update_fields=["file", "is_deleted", "deleted_at"])
            scrubbed += 1
    return scrubbed
