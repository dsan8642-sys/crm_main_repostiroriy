from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.utils import timezone


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Активен"
    FROZEN = "frozen", "Заморожен"
    EXPIRED = "expired", "Истёк"
    CANCELLED = "cancelled", "Отменён"


class Subscription(models.Model):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="subscriptions")
    subscription_type = models.ForeignKey("catalog.SubscriptionType", on_delete=models.PROTECT)
    start_date = models.DateField()
    base_end_date = models.DateField(help_text="Дата окончания без учёта заморозок")
    status = models.CharField(max_length=16, choices=SubscriptionStatus.choices,
                              default=SubscriptionStatus.ACTIVE)
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def total_frozen_days(self):
        # Rule 3: freeze is an interval; each freeze shifts the end date by its length.
        return sum(f.days for f in self.freeze_periods.all())

    @property
    def effective_end_date(self):
        return self.base_end_date + timedelta(days=self.total_frozen_days)

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
                and self.start_date <= when <= self.effective_end_date)

    def __str__(self):
        return f"{self.student} · {self.subscription_type.name}"


class FreezePeriod(models.Model):
    """Rule 3: freeze is an interval (from-to), not a flag. History is preserved."""
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="freeze_periods")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    def clean(self):
        if self.end_date < self.start_date:
            raise ValidationError("Дата окончания заморозки раньше даты начала")

    @property
    def days(self):
        return (self.end_date - self.start_date).days + 1  # inclusive

    def __str__(self):
        return f"Заморозка {self.start_date}–{self.end_date} ({self.days} дн.)"


class LedgerReason(models.TextChoices):
    PURCHASE = "purchase", "Покупка абонемента (+N)"
    ATTENDANCE = "attendance", "Посещение (-1)"
    CORRECTION = "correction", "Коррекция статуса посещаемости"
    MANUAL = "manual", "Ручная корректировка админом"
    CARRYOVER = "carryover", "Перенос остатка при продлении"


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
