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

from .models import Charge, Payment, PaymentStatus, ReceiptFile


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


@transaction.atomic
def confirm_payment(payment: Payment, admin):
    """Rule 9: admin verifies -> Confirmed. Only now does it affect balance."""
    if payment.status == PaymentStatus.CONFIRMED:
        return payment
    payment.status = PaymentStatus.CONFIRMED
    payment.confirmed_by = admin
    payment.confirmed_at = timezone.now()
    payment.save(update_fields=["status", "confirmed_by", "confirmed_at"])
    payment.receipts.update(decided_at=timezone.now())
    audit(admin, "payment.confirmed", payment,
          {"amount_minor": payment.amount_minor, "currency": payment.currency})
    return payment


@transaction.atomic
def reject_payment(payment: Payment, admin, reason=""):
    payment.status = PaymentStatus.REJECTED
    payment.confirmed_by = admin
    payment.confirmed_at = timezone.now()
    if reason:
        payment.comment = (payment.comment + f"\nОтклонено: {reason}").strip()
    payment.save(update_fields=["status", "confirmed_by", "confirmed_at", "comment"])
    payment.receipts.update(decided_at=timezone.now())
    audit(admin, "payment.rejected", payment, {"reason": reason})
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
