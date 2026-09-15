"""Module 5.5: debt control — 'Должники' and 'Скоро оплата' with day-window filters."""
from dataclasses import dataclass, field
from datetime import timedelta

from django.conf import settings
from django.db.models import Prefetch
from django.utils import timezone

from billing.models import Charge, Payment, PaymentStatus
from students.models import Student
from subscriptions.models import Subscription, SubscriptionStatus

FILTER_DAYS = (1, 3, 7, 14, 30)  # 'сегодня'==1, then 3/7/14/30


@dataclass
class DebtorRow:
    student: Student
    reasons: list = field(default_factory=list)
    balance_minor: int = 0
    currency: str = "PLN"
    oldest_due_date: object = None
    last_payment_at: object = None


def debtors(currency=None):
    """Return active participants whose monetary balance is owed to the club.

    Charges and confirmed payments are prefetched in batches.  This keeps the
    result identical for the dashboard badge and the debtors page without the
    previous per-participant balance/status/subscription queries.
    """
    currency = currency or settings.DEFAULT_CURRENCY
    today = timezone.localdate()
    out = []
    students = Student.objects.filter(
            is_active=True, parent__user__is_active=True,
    ).select_related("parent", "parent__user").prefetch_related(
        "groups",
        Prefetch(
            "charges",
            queryset=Charge.objects.filter(currency=currency)
            .select_related("reversal").order_by("due_date", "id"),
            to_attr="debtor_charges",
        ),
        Prefetch(
            "payments",
            queryset=Payment.objects.filter(
                currency=currency, status=PaymentStatus.CONFIRMED,
            ).order_by("-paid_at", "-id"),
            to_attr="debtor_payments",
        ),
    )
    for st in students:
        reasons = []
        charged = sum(charge.amount_minor for charge in st.debtor_charges)
        reversed_minor = sum(
            charge.reversal.amount_minor
            for charge in st.debtor_charges if hasattr(charge, "reversal")
        )
        paid_minor = sum(payment.amount_minor for payment in st.debtor_payments)
        balance_minor = charged - reversed_minor - paid_minor
        if balance_minor <= 0:
            continue

        payment_pool = paid_minor
        oldest_due_date = None
        for charge in st.debtor_charges:
            if hasattr(charge, "reversal"):
                continue
            applied = min(payment_pool, charge.amount_minor)
            payment_pool -= applied
            if applied < charge.amount_minor and charge.due_date < today:
                oldest_due_date = oldest_due_date or charge.due_date

        if oldest_due_date is not None:
            reasons.append("Просроченная оплата")
        reasons.append("Отрицательный баланс")
        out.append(DebtorRow(
            student=st,
            reasons=reasons,
            balance_minor=balance_minor,
            currency=currency,
            oldest_due_date=oldest_due_date,
            last_payment_at=(st.debtor_payments[0].paid_at
                             if st.debtor_payments else None),
        ))
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
                .filter(
                    status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN],
                    student__is_active=True,
                    student__parent__user__is_active=True,
                )
                .select_related("student", "student__parent__user", "subscription_type")):
        end = sub.effective_end_date
        remaining = sub.remaining_sessions
        ends_soon = today <= end <= horizon
        low_sessions = (min_sessions is not None and remaining is not None
                        and remaining <= min_sessions)
        if ends_soon or low_sessions:
            out.append(UpcomingRow(student=sub.student, subscription=sub,
                                   days_left=(end - today).days, sessions_left=remaining))
    return out
