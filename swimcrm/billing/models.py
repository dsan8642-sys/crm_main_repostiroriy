from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.utils import timezone

from common.money import CURRENCY_CHOICES, Money

from .validators import (validate_receipt_content, validate_receipt_extension,
                         validate_receipt_size)


class Charge(models.Model):
    """Rule 8: an obligation of a student (how much, for what, by when).
    Kept SEPARATE from payments; balance is charges minus confirmed payments."""
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="charges")
    subscription = models.ForeignKey("subscriptions.Subscription", null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name="charges")
    description = models.CharField(max_length=255)
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    due_date = models.DateField()
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def amount(self) -> Money:
        return Money(self.amount_minor, self.currency)

    def __str__(self):
        return f"{self.description}: {self.amount} (до {self.due_date})"

    def delete(self, *args, **kwargs):
        raise ValidationError("Charge history is immutable and cannot be deleted.")


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Наличные"
    TRANSFER = "bank_transfer", "Bank transfer"
    CARD = "card", "Карта"
    OTHER = "other", "Другое"


PAYMENT_METHOD_ALIASES = {
    "transfer": PaymentMethod.TRANSFER,
}


def normalize_payment_method(value):
    if value is None:
        return value
    return PAYMENT_METHOD_ALIASES.get(value, value)


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Ожидает подтверждения"
    CONFIRMED = "confirmed", "Подтверждён"
    REJECTED = "rejected", "Отклонён"


class Payment(models.Model):
    """Rule 9: a fact of payment. Entered by admin OR via a parent-uploaded receipt.
    Only CONFIRMED payments reduce the balance. The record is kept permanently
    (rule 10) as the accounting document, even after the receipt file is deleted."""
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="payments")
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    paid_at = models.DateField()
    method = models.CharField(max_length=16, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="created_payments")
    # Rule 10: evidential chain retained on the Payment even after ReceiptFile removal.
    confirmed_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name="confirmed_payments")
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def amount(self) -> Money:
        return Money(self.amount_minor, self.currency)

    def __str__(self):
        return f"{self.student} · {self.amount} · {self.get_status_display()}"


    def delete(self, *args, **kwargs):
        raise ValidationError("Payment history is immutable and cannot be deleted.")


class ReceiptFile(models.Model):
    """Rule 10: temporary proof uploaded by a parent. Auto-deleted after N days;
    the Payment survives. `deleted` marks the file scrubbed but the row is a stub log."""
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="receipts")
    uploaded_by = models.ForeignKey("accounts.ParentAccount", null=True, blank=True, on_delete=models.SET_NULL)
    file = models.FileField(
        upload_to="receipts/%Y/%m/", null=True, blank=True,
        validators=[validate_receipt_extension, validate_receipt_size,
                    validate_receipt_content])
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    decided_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    @property
    def retention_anchor(self):
        # Retention counts from the decision date if present, else upload date (rule 10).
        return self.decided_at or self.uploaded_at

    def __str__(self):
        return f"Чек к {self.payment} ({'удалён' if self.is_deleted else 'хранится'})"


@receiver(pre_delete, sender=Payment)
def prevent_payment_delete(sender, instance, **kwargs):
    raise ValidationError("Payment history is immutable and cannot be deleted.")


@receiver(pre_delete, sender=Charge)
def prevent_charge_delete(sender, instance, **kwargs):
    raise ValidationError("Charge history is immutable and cannot be deleted.")
