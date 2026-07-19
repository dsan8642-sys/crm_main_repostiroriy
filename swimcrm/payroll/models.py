from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from common.money import CURRENCY_CHOICES, Money
from scheduling.models import SessionType


class PayrollRuleType(models.TextChoices):
    GROUP = "group", "Group"
    INDIVIDUAL = "individual", "Individual"
    SPLIT = "split", "Split"


class PayrollPeriodStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CALCULATED = "calculated", "Calculated"
    APPROVED = "approved", "Approved"
    EXPORTED = "exported", "Exported"


class PayrollScheme(models.Model):
    name = models.CharField(max_length=120, unique=True)
    location = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class PayrollRule(models.Model):
    scheme = models.ForeignKey(PayrollScheme, on_delete=models.CASCADE, related_name="rules")
    session_type = models.CharField(max_length=16, choices=SessionType.choices)
    rule_type = models.CharField(max_length=16, choices=PayrollRuleType.choices)
    base_amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    min_clients_threshold = models.PositiveIntegerField(null=True, blank=True)
    extra_client_amount_minor = models.BigIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["scheme", "session_type", "rule_type"],
                name="uniq_payroll_rule_scheme_session_rule_type",
            ),
        ]

    @property
    def base_amount(self):
        return Money(self.base_amount_minor, self.currency)

    @property
    def extra_client_amount(self):
        return Money(self.extra_client_amount_minor or 0, self.currency)

    def clean(self):
        if self.base_amount_minor < 0:
            raise ValidationError("base_amount_minor cannot be negative")
        if self.extra_client_amount_minor is not None and self.extra_client_amount_minor < 0:
            raise ValidationError("extra_client_amount_minor cannot be negative")
        if self.rule_type != self.session_type:
            raise ValidationError("rule_type must match session_type")
        if self.rule_type == PayrollRuleType.GROUP:
            if self.min_clients_threshold is None:
                raise ValidationError("group payroll rule requires min_clients_threshold")
            if self.extra_client_amount_minor is None:
                raise ValidationError("group payroll rule requires extra_client_amount_minor")
        else:
            if self.min_clients_threshold not in (None, 0):
                raise ValidationError("fixed payroll rules must not define min_clients_threshold")
            if self.extra_client_amount_minor not in (None, 0):
                raise ValidationError("fixed payroll rules must not define extra_client_amount_minor")

    def __str__(self):
        return f"{self.scheme} / {self.session_type}"


class TrainerPayrollAssignment(models.Model):
    trainer = models.ForeignKey("accounts.Trainer", on_delete=models.CASCADE,
                                related_name="payroll_assignments")
    scheme = models.ForeignKey(PayrollScheme, on_delete=models.PROTECT,
                               related_name="trainer_assignments")
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["trainer", "effective_from", "effective_to"]),
        ]

    def clean(self):
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError("effective_to cannot be before effective_from")

    def __str__(self):
        return f"{self.trainer} -> {self.scheme}"


class PayrollPeriod(models.Model):
    date_from = models.DateField()
    date_to = models.DateField()
    location = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=16, choices=PayrollPeriodStatus.choices,
                              default=PayrollPeriodStatus.DRAFT)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["date_from", "date_to", "location"],
                name="uniq_payroll_period_dates_location",
            ),
        ]

    def clean(self):
        if self.date_to < self.date_from:
            raise ValidationError("date_to cannot be before date_from")

    def __str__(self):
        suffix = f" / {self.location}" if self.location else ""
        return f"{self.date_from} - {self.date_to}{suffix}"


class PayrollCalculation(models.Model):
    period = models.ForeignKey(PayrollPeriod, on_delete=models.CASCADE,
                               related_name="calculations")
    trainer = models.ForeignKey("accounts.Trainer", on_delete=models.PROTECT,
                                related_name="payroll_calculations")
    session = models.ForeignKey("scheduling.Session", on_delete=models.PROTECT,
                                related_name="payroll_calculations")
    rule = models.ForeignKey(PayrollRule, on_delete=models.PROTECT,
                             related_name="calculations")
    attended_clients_count = models.PositiveIntegerField(default=0)
    base_amount_minor = models.BigIntegerField()
    extra_clients_count = models.PositiveIntegerField(default=0)
    extra_amount_minor = models.BigIntegerField(default=0)
    final_amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["period", "trainer", "session"],
                name="uniq_payroll_calc_period_trainer_session",
            ),
        ]

    @property
    def final_amount(self):
        return Money(self.final_amount_minor, self.currency)


class PayrollAdjustment(models.Model):
    period = models.ForeignKey(PayrollPeriod, on_delete=models.CASCADE,
                               related_name="adjustments")
    trainer = models.ForeignKey("accounts.Trainer", on_delete=models.PROTECT,
                                related_name="payroll_adjustments")
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True,
                                   on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def amount(self):
        return Money(self.amount_minor, self.currency)
