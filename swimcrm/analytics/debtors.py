"""Module 5.5: debt control — 'Должники' and 'Скоро оплата' with day-window filters."""
from dataclasses import dataclass, field
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from billing.services import charge_statuses, student_balance
from students.models import Student
from subscriptions.models import Subscription, SubscriptionStatus

FILTER_DAYS = (1, 3, 7, 14, 30)  # 'сегодня'==1, then 3/7/14/30


@dataclass
class DebtorRow:
    student: Student
    reasons: list = field(default_factory=list)
    balance_minor: int = 0
    currency: str = "PLN"


def debtors(currency=None):
    """A student is a debtor if any of: overdue charge, expired subscription,
    or negative balance (charges exceed confirmed payments)."""
    currency = currency or settings.DEFAULT_CURRENCY
    today = timezone.localdate()
    out = []
    for st in Student.objects.filter(is_active=True).select_related("parent", "group"):
        reasons = []
        bal = student_balance(st, currency)
        if any(cs.is_overdue for cs in charge_statuses(st, currency)):
            reasons.append("Просроченная оплата")
        if bal.amount_minor > 0:
            reasons.append("Отрицательный баланс")
        expired = Subscription.objects.filter(student=st).exclude(
            status=SubscriptionStatus.CANCELLED)
        if expired and all(s.grace_end_date < today for s in expired):
            reasons.append("Истёкший абонемент")
        if reasons:
            out.append(DebtorRow(student=st, reasons=reasons,
                                 balance_minor=bal.amount_minor, currency=currency))
    return out


@dataclass
class UpcomingRow:
    student: Student
    subscription: Subscription
    days_left: int
    sessions_left: object  # int or None (unlimited)


def upcoming(within_days=7, min_sessions=None):
    """'Скоро оплата': subscription ends within `within_days`, OR remaining
    sessions below `min_sessions`. Use FILTER_DAYS values for within_days."""
    today = timezone.localdate()
    horizon = today + timedelta(days=within_days)
    out = []
    for sub in (Subscription.objects
                .filter(status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN])
                .select_related("student", "subscription_type")):
        end = sub.effective_end_date
        remaining = sub.remaining_sessions
        ends_soon = today <= end <= horizon
        low_sessions = (min_sessions is not None and remaining is not None
                        and remaining <= min_sessions)
        if ends_soon or low_sessions:
            out.append(UpcomingRow(student=sub.student, subscription=sub,
                                   days_left=(end - today).days, sessions_left=remaining))
    return out
