"""Module 5.9: financial & attendance reports. Income = cash basis (confirmed payments)."""
from django.db.models import Count, Q, Sum
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus
from billing.models import Charge, Payment, PaymentStatus
from common.money import Money


def income_for_period(date_from, date_to, currency="PLN"):
    """Cash basis: sum of CONFIRMED payments in [date_from, date_to]."""
    total = (Payment.objects.filter(status=PaymentStatus.CONFIRMED, currency=currency,
                                    paid_at__gte=date_from, paid_at__lte=date_to)
             .aggregate(t=Sum("amount_minor"))["t"] or 0)
    return Money(total, currency)


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
