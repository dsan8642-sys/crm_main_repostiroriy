"""Module 5.9: financial, schedule and attendance reports."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import Trainer
from attendance.models import AttendanceRecord, AttendanceStatus
from billing.models import Charge, Payment, PaymentMethod, PaymentStatus
from common.money import Money
from scheduling.models import Session, SessionType


REPORT_TIMEZONE = ZoneInfo("Europe/Warsaw")


def _session_period_bounds(date_from, date_to):
    """Return a DST-safe half-open range for Warsaw calendar dates."""
    return (
        datetime.combine(date_from, time.min, tzinfo=REPORT_TIMEZONE),
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=REPORT_TIMEZONE),
    )


def session_counts_for_period(date_from, date_to, trainer=None):
    """Count non-cancelled sessions by type and effective trainer."""
    start_at, end_at = _session_period_bounds(date_from, date_to)
    sessions = (
        Session.objects.filter(
            is_cancelled=False,
            start_at__gte=start_at,
            start_at__lt=end_at,
        )
        .annotate(report_trainer_id=Coalesce("substitute_trainer_id", "trainer_id"))
    )
    if trainer is not None:
        sessions = sessions.filter(report_trainer_id=trainer.id)

    aggregates = {
        row["report_trainer_id"]: row
        for row in sessions.values("report_trainer_id").annotate(
            group=Count("id", filter=Q(session_type=SessionType.GROUP)),
            individual=Count("id", filter=Q(session_type=SessionType.INDIVIDUAL)),
            split=Count("id", filter=Q(session_type=SessionType.SPLIT)),
        )
    }
    if trainer is not None:
        trainers = Trainer.objects.select_related("user").filter(pk=trainer.pk)
    else:
        trainers = Trainer.objects.select_related("user").filter(
            Q(is_active=True) | Q(pk__in=aggregates),
        )
    trainers = trainers.order_by(
        "user__first_name", "user__last_name", "id",
    )

    rows = []
    for current in trainers:
        counts = aggregates.get(current.id, {})
        row = {
            "trainer_id": current.id,
            "trainer": str(current),
            "is_active": current.is_active,
            "group": counts.get("group", 0),
            "individual": counts.get("individual", 0),
            "split": counts.get("split", 0),
        }
        row["total"] = row["group"] + row["individual"] + row["split"]
        rows.append(row)

    totals = {
        key: sum(row[key] for row in rows)
        for key in ("group", "individual", "split")
    }
    totals["total"] = sum(totals.values())
    return rows, totals


def confirmed_payments_for_period(date_from, date_to, currency="PLN"):
    return (
        Payment.objects.select_related("student__parent")
        .filter(
            status=PaymentStatus.CONFIRMED,
            currency=currency,
            paid_at__gte=date_from,
            paid_at__lte=date_to,
        )
        .order_by("-paid_at", "-id")
    )


def income_breakdown_for_period(date_from, date_to, currency="PLN"):
    aggregate = confirmed_payments_for_period(date_from, date_to, currency).aggregate(
        total=Sum("amount_minor"),
        cash=Sum("amount_minor", filter=Q(method=PaymentMethod.CASH)),
    )
    total_minor = aggregate["total"] or 0
    cash_minor = aggregate["cash"] or 0
    return {
        "total": Money(total_minor, currency),
        "cash": Money(cash_minor, currency),
        "non_cash": Money(total_minor - cash_minor, currency),
    }


def income_for_period(date_from, date_to, currency="PLN"):
    """Cash basis: sum of CONFIRMED payments in [date_from, date_to]."""
    return income_breakdown_for_period(date_from, date_to, currency)["total"]


def income_by_group(date_from, date_to, currency="PLN"):
    qs = (Payment.objects.filter(status=PaymentStatus.CONFIRMED, currency=currency,
                                 paid_at__gte=date_from, paid_at__lte=date_to)
          .values("student__group__name")
          .annotate(total=Sum("amount_minor")).order_by("-total"))
    return [(r["student__group__name"] or "— без группы —", Money(r["total"], currency)) for r in qs]


def income_by_trainer(date_from, date_to, currency="PLN"):
    """Attributes confirmed payments to the trainer of the student's group."""
    qs = (Payment.objects.filter(status=PaymentStatus.CONFIRMED, currency=currency,
                                 paid_at__gte=date_from, paid_at__lte=date_to)
          .values("student__group__default_trainer__user__first_name",
                  "student__group__default_trainer__user__last_name")
          .annotate(total=Sum("amount_minor")).order_by("-total"))
    out = []
    for r in qs:
        name = (f'{r["student__group__default_trainer__user__first_name"] or ""} '
                f'{r["student__group__default_trainer__user__last_name"] or ""}').strip() or "— не назначен —"
        out.append((name, Money(r["total"], currency)))
    return out


def unpaid_charges(currency="PLN"):
    """Charges not fully covered by confirmed payments (per student aggregate)."""
    from billing.services import charge_statuses
    from students.models import Student
    rows = []
    for st in Student.objects.filter(charges__currency=currency).distinct():
        for cs in charge_statuses(st, currency):
            if not cs.is_paid:
                rows.append((st, cs.charge, cs.paid_minor, cs.label))
    return rows


def attendance_summary(*, student=None, group=None, trainer=None, date_from=None, date_to=None):
    """Counts per status for the chosen scope."""
    qs = AttendanceRecord.objects.all()
    if student:
        qs = qs.filter(student=student)
    if group:
        qs = qs.filter(session__group=group)
    if trainer:
        qs = qs.filter(session__trainer=trainer)
    if date_from:
        qs = qs.filter(session__start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(session__start_at__date__lte=date_to)
    agg = qs.aggregate(
        present=Count("id", filter=Q(status=AttendanceStatus.PRESENT)),
        absent=Count("id", filter=Q(status=AttendanceStatus.ABSENT)),
        excused=Count("id", filter=Q(status=AttendanceStatus.EXCUSED)),
        rescheduled=Count("id", filter=Q(status=AttendanceStatus.RESCHEDULED)),
        total=Count("id"),
    )
    return agg
