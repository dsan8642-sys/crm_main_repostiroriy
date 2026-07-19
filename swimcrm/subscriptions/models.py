from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.utils import timezone


_allow_subscription_history_delete = ContextVar("allow_subscription_history_delete", default=False)


@contextmanager
def allow_subscription_history_delete():
    """Internal rollback-only escape hatch for deleting uncommitted import batches."""
    token = _allow_subscription_history_delete.set(True)
    try:
        yield
    finally:
        _allow_subscription_history_delete.reset(token)


def _delete_allowed():
    return _allow_subscription_history_delete.get()


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Активен"
    FROZEN = "frozen", "Заморожен"
    EXPIRED = "expired", "Истёк"
    CANCELLED = "cancelled", "Отменён"


class SubscriptionQuerySet(models.QuerySet):
    def delete(self):
        if _delete_allowed():
            return super().delete()
        raise ValidationError("Subscription history is immutable and cannot be deleted.")


class Subscription(models.Model):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="subscriptions")
    subscription_type = models.ForeignKey("catalog.SubscriptionType", on_delete=models.PROTECT)
    start_date = models.DateField()
    base_end_date = models.DateField(help_text="Дата окончания без учёта заморозок")
    status = models.CharField(max_length=16, choices=SubscriptionStatus.choices,
                              default=SubscriptionStatus.ACTIVE)
    created_at = models.DateTimeField(default=timezone.now)

    objects = SubscriptionQuerySet.as_manager()

    @property
    def total_frozen_days(self):
        # Rule 3: freeze is an interval; each freeze shifts the end date by its length.
        return sum(f.days for f in self.freeze_periods.all())

    @property
    def effective_end_date(self):
        return self.base_end_date + timedelta(days=self.total_frozen_days)

    @property
    def grace_end_date(self):
        return self.effective_end_date + timedelta(days=settings.SUBSCRIPTION_GRACE_DAYS)

    @property
    def remaining_sessions(self):
        # Rule 1: remaining = SUM of ledger deltas, never a stored counter.
        if self.subscription_type.is_unlimited:
            return None
        agg = self.ledger_entries.aggregate(total=Sum("delta"))
        return agg["total"] or 0

    def is_active_on(self, when=None):
        when = when or timezone.localdate()
        return (self.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN)
                and self.start_date <= when <= self.grace_end_date)

    def __str__(self):
        return f"{self.student} · {self.subscription_type.name}"

    def delete(self, *args, **kwargs):
        if _delete_allowed():
            return super().delete(*args, **kwargs)
        raise ValidationError("Subscription history is immutable and cannot be deleted.")


class FreezePeriodQuerySet(models.QuerySet):
    def delete(self):
        if _delete_allowed():
            return super().delete()
        raise ValidationError("Freeze history is immutable and cannot be deleted.")

    def update(self, **kwargs):
        raise ValidationError("Freeze history is immutable and cannot be updated.")


class FreezePeriod(models.Model):
    """Rule 3: freeze is an interval (from-to), not a flag. History is preserved."""
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="freeze_periods")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    objects = FreezePeriodQuerySet.as_manager()

    def clean(self):
        if self.end_date < self.start_date:
            raise ValidationError("Дата окончания заморозки раньше даты начала")

    @property
    def days(self):
        return (self.end_date - self.start_date).days + 1  # inclusive

    def __str__(self):
        return f"Заморозка {self.start_date}–{self.end_date} ({self.days} дн.)"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValidationError("Freeze history is immutable and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if _delete_allowed():
            return super().delete(*args, **kwargs)
        raise ValidationError("Freeze history is immutable and cannot be deleted.")


@receiver(pre_delete, sender=Subscription)
def prevent_subscription_delete(sender, instance, **kwargs):
    if _delete_allowed():
        return
    raise ValidationError("Subscription history is immutable and cannot be deleted.")


@receiver(pre_delete, sender=FreezePeriod)
def prevent_freeze_period_delete(sender, instance, **kwargs):
    if _delete_allowed():
        return
    raise ValidationError("Freeze history is immutable and cannot be deleted.")


class LedgerReason(models.TextChoices):
    PURCHASE = "purchase", "Покупка абонемента (+N)"
    ATTENDANCE = "attendance", "Посещение (-1)"
    CORRECTION = "correction", "Коррекция статуса посещаемости"
    MANUAL = "manual", "Ручная корректировка админом"
    CARRYOVER = "carryover", "Перенос остатка при продлении"


class SessionLedgerQuerySet(models.QuerySet):
    def delete(self):
        if _delete_allowed():
            return super().delete()
        raise ValidationError("Ledger entries are immutable and cannot be deleted.")

    def update(self, **kwargs):
        raise ValidationError("Ledger entries are immutable and cannot be updated.")


@receiver(pre_delete, sender="subscriptions.SessionLedgerEntry")
def prevent_ledger_entry_delete(sender, instance, **kwargs):
    if _delete_allowed():
        return
    raise ValidationError("Ledger entries are immutable and cannot be deleted.")


class SessionLedgerEntry(models.Model):
    """Rule 1: append-only journal of session-balance movements. Immutable.
    Balance = SUM(delta). Purchase => +N, attended => -1, manual => its own row."""
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="ledger_entries")
    delta = models.IntegerField()
    reason = models.CharField(max_length=16, choices=LedgerReason.choices)
    attendance = models.ForeignKey("attendance.AttendanceRecord", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="ledger_entries")
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    objects = SessionLedgerQuerySet.as_manager()

    class Meta:
        ordering = ["created_at", "id"]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValidationError("Записи журнала движений неизменяемы (append-only)")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Записи журнала движений нельзя удалять")

    def __str__(self):
        return f"{'+' if self.delta >= 0 else ''}{self.delta} · {self.get_reason_display()}"
