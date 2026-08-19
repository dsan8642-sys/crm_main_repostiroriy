from django.conf import settings
from django.db import models

from common.money import CURRENCY_CHOICES, Money


class Group(models.Model):
    """A recurring training group with its own schedule defaults."""
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    default_trainer = models.ForeignKey(
        "accounts.Trainer", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="default_groups",
    )
    default_location = models.ForeignKey(
        "scheduling.Location", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="default_groups",
    )
    price_minor = models.BigIntegerField(
        null=True, blank=True,
        help_text="Цена одного занятия в минорных единицах; пусто = не начислять")
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    default_capacity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Вместимость по умолчанию для новых групповых занятий",
    )
    color_key = models.CharField(max_length=32, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(default_capacity__isnull=True)
                    | models.Q(default_capacity__gt=0)
                ),
                name="catalog_group_default_capacity_positive",
            ),
        ]

    @property
    def price(self) -> Money | None:
        """Charged per attended session when no subscription covers it."""
        return None if self.price_minor is None else Money(self.price_minor, self.currency)

    def __str__(self):
        return self.name


class SubscriptionType(models.Model):
    """Types: 4/8/12 sessions, unlimited, individual. sessions_count=NULL => unlimited."""
    name = models.CharField(max_length=120, unique=True)
    price_minor = models.BigIntegerField(help_text="Цена в минорных единицах (гроши)")
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                default=settings.DEFAULT_CURRENCY)
    duration_days = models.PositiveIntegerField(help_text="Срок действия абонемента, дней")
    sessions_count = models.PositiveIntegerField(
        null=True, blank=True, help_text="Количество занятий; пусто = безлимит")
    is_individual = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    @property
    def is_unlimited(self):
        return self.sessions_count is None

    @property
    def price(self) -> Money:
        return Money(self.price_minor, self.currency)

    def __str__(self):
        kind = "безлимит" if self.is_unlimited else f"{self.sessions_count} зан."
        return f"{self.name} ({kind}, {self.price})"
