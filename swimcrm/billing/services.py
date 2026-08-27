"""Rules 8, 9, 10: balance from charges minus confirmed payments; payment workflow;
receipt auto-deletion. Accounting method: cash basis (confirmed payments)."""
from dataclasses import dataclass
from datetime import timedelta
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from audit.models import audit
from common.money import Money

from .models import (
    Charge, Payment, PaymentEvent, PaymentEventType, PaymentMethod,
    PaymentSource, PaymentStatus, ReceiptFile,
)


_IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$")


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
        raise ValidationError({
            "amount_minor": ValidationError(
                "Введите сумму больше нуля.", code="invalid_integer"),
        }) from None
    if amount_minor <= 0:
        raise ValidationError({
            "amount_minor": ValidationError(
                "Сумма должна быть больше нуля.", code="min_value"),
        })
    return amount_minor


def payment_reference_id(*, source, actor, idempotency_key):
    """Scope a caller-provided retry key into the existing unique reference_id."""
    key = str(idempotency_key or "").strip()
    if not key:
        raise ValidationError({
            "idempotency_key": ValidationError(
                "Повторите действие: ключ безопасной отправки отсутствует.",
                code="required"),
        })
    if not _IDEMPOTENCY_KEY_RE.fullmatch(key):
        raise ValidationError({
            "idempotency_key": ValidationError(
                "Ключ безопасной отправки имеет недопустимый формат.",
                code="invalid"),
        })
    actor_id = getattr(actor, "pk", None)
    if not actor_id:
        raise ValidationError({
            "idempotency_key": ValidationError(
                "Не удалось связать ключ отправки с пользователем.",
                code="invalid"),
        })
    return f"ui:{source}:{actor_id}:{key}"


def _validate_payment_replay(
        payment, *, student, amount_minor, currency, paid_at, method, source,
        comment=""):
    immutable_values = {
        "student_id": student.pk,
        "amount_minor": amount_minor,
        "currency": currency,
        "paid_at": paid_at,
        "method": method,
        "source": source,
    }
    if any(getattr(payment, field) != value for field, value in immutable_values.items()):
        raise ValidationError({
            "idempotency_key": ValidationError(
                "Этот ключ уже использован для другой финансовой операции.",
                code="conflict"),
        })
    original_comment = str(comment or "").strip()
    if original_comment and not payment.comment.startswith(original_comment):
        raise ValidationError({
            "idempotency_key": ValidationError(
                "Этот ключ уже использован для другой финансовой операции.",
                code="conflict"),
        })
    return payment


def _existing_idempotent_payment(reference_id, **expected):
    payment = Payment.objects.filter(reference_id=reference_id).first()
    if payment is None:
        return None
    return _validate_payment_replay(payment, **expected)


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
        *, student, account, actor, amount_minor, currency, paid_at, file,
        idempotency_key, comment=""):
    """Create a pending bank-transfer request; never credit the balance here."""
    amount_minor = _validate_payment_amount(amount_minor)
    try:
        Money(amount_minor, currency)
    except (TypeError, ValueError) as exc:
        raise ValidationError({
            "currency": ValidationError(
                "Укажите поддерживаемую валюту.", code="invalid_choice"),
        }) from exc

    reference_id = payment_reference_id(
        source=PaymentSource.CLIENT_TOP_UP,
        actor=actor,
        idempotency_key=idempotency_key,
    )
    expected = {
        "student": student,
        "amount_minor": amount_minor,
        "currency": currency,
        "paid_at": paid_at,
        "method": PaymentMethod.TRANSFER,
        "source": PaymentSource.CLIENT_TOP_UP,
        "comment": comment,
    }
    existing = _existing_idempotent_payment(reference_id, **expected)
    if existing is not None:
        receipt = existing.receipts.order_by("id").first()
        if receipt is None:
            raise ValidationError({
                "idempotency_key": ValidationError(
                    "Повтор операции найден без подтверждающего документа.",
                    code="conflict"),
            })
        return existing, receipt, False

    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                student=student,
                amount_minor=amount_minor,
                currency=currency,
                paid_at=paid_at,
                method=PaymentMethod.TRANSFER,
                reference_id=reference_id,
                comment=comment or "",
                status=PaymentStatus.PENDING,
                source=PaymentSource.CLIENT_TOP_UP,
                created_by=actor,
            )
    except IntegrityError:
        existing = Payment.objects.get(reference_id=reference_id)
        _validate_payment_replay(existing, **expected)
        receipt = existing.receipts.order_by("id").first()
        if receipt is None:
            raise ValidationError({
                "idempotency_key": ValidationError(
                    "Повтор операции найден без подтверждающего документа.",
                    code="conflict"),
            })
        return existing, receipt, False

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
    return payment, receipt, True


@transaction.atomic
def create_admin_payment(
        *, student, actor, amount_minor, currency, paid_at, method,
        idempotency_key, comment="", desired_status=PaymentStatus.CONFIRMED,
        reason=""):
    """Create at most one admin payment for one UI attempt."""
    amount_minor = _validate_payment_amount(amount_minor)
    reference_id = payment_reference_id(
        source=PaymentSource.ADMIN,
        actor=actor,
        idempotency_key=idempotency_key,
    )
    expected = {
        "student": student,
        "amount_minor": amount_minor,
        "currency": currency,
        "paid_at": paid_at,
        "method": method,
        "source": PaymentSource.ADMIN,
        "comment": comment,
    }
    existing = _existing_idempotent_payment(reference_id, **expected)
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                student=student,
                amount_minor=amount_minor,
                currency=currency,
                paid_at=paid_at,
                method=method,
                reference_id=reference_id,
                comment=comment or "",
                status=PaymentStatus.PENDING,
                source=PaymentSource.ADMIN,
                created_by=actor,
            )
    except IntegrityError:
        existing = Payment.objects.get(reference_id=reference_id)
        _validate_payment_replay(existing, **expected)
        return existing, False

    record_admin_payment_created(payment, actor)
    if desired_status == PaymentStatus.REJECTED:
        payment = reject_payment(payment, actor, reason)
    elif desired_status == PaymentStatus.PENDING:
        pass
    else:
        payment = confirm_payment(payment, actor)
    return payment, True


def record_admin_payment_created(payment, actor):
    _record_payment_event(payment, PaymentEventType.CREATED, actor)
    audit(actor, "payment.created", payment, {"status": payment.status})


@transaction.atomic
def confirm_payment(payment: Payment, admin):
    """Rule 9: admin verifies -> Confirmed. Only now does it affect balance."""
    original = payment
    decided_at = timezone.now()
    updated = Payment.objects.filter(
        pk=payment.pk, status=PaymentStatus.PENDING).update(
            status=PaymentStatus.CONFIRMED,
            confirmed_by=admin,
            confirmed_at=decided_at,
        )
    payment = Payment.objects.get(pk=payment.pk)
    if not updated:
        if payment.status == PaymentStatus.CONFIRMED:
            _sync_payment_instance(original, payment)
            return payment
        raise ValidationError("Only a pending payment can be confirmed")
    previous_status = PaymentStatus.PENDING
    payment.receipts.update(decided_at=timezone.now())
    _record_payment_event(
        payment, PaymentEventType.CONFIRMED, admin, from_status=previous_status)
    audit(admin, "payment.confirmed", payment,
          {"amount_minor": payment.amount_minor, "currency": payment.currency})
    _sync_payment_instance(original, payment)
    return payment


@transaction.atomic
def reject_payment(payment: Payment, admin, reason=""):
    reason = str(reason or "").strip()
    if not reason:
        raise ValidationError({
            "reason": ValidationError(
                "Укажите причину отклонения.", code="required"),
        })
    original = payment
    decided_at = timezone.now()
    current = Payment.objects.get(pk=payment.pk)
    next_comment = (current.comment + f"\nОтклонено: {reason}").strip()
    updated = Payment.objects.filter(
        pk=payment.pk, status=PaymentStatus.PENDING).update(
            status=PaymentStatus.REJECTED,
            confirmed_by=admin,
            confirmed_at=decided_at,
            comment=next_comment,
        )
    payment = Payment.objects.get(pk=payment.pk)
    if not updated:
        if payment.status == PaymentStatus.REJECTED:
            _sync_payment_instance(original, payment)
            return payment
        raise ValidationError("Only a pending payment can be rejected")
    previous_status = PaymentStatus.PENDING
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
