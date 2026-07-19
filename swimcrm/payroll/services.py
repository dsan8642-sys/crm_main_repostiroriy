from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, Sum

from attendance.models import DEDUCTING_STATUSES
from audit.models import audit
from scheduling.models import Session

from .models import (PayrollCalculation, PayrollPeriod, PayrollPeriodStatus,
                     PayrollRule, PayrollRuleType, TrainerPayrollAssignment)


@dataclass(frozen=True)
class PayrollSummary:
    period: PayrollPeriod
    calculations_count: int
    total_amount_minor: int
    currency: str


def _assignment_for(trainer, session_date):
    return (TrainerPayrollAssignment.objects
            .filter(trainer=trainer, scheme__is_active=True,
                    effective_from__lte=session_date)
            .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=session_date))
            .select_related("scheme")
            .order_by("-effective_from", "-id")
            .first())


def _rule_for(assignment, session_type):
    return (PayrollRule.objects
            .filter(scheme=assignment.scheme, session_type=session_type,
                    rule_type=session_type, is_active=True)
            .first())


def _amounts(rule, attended_count):
    if rule.rule_type == PayrollRuleType.GROUP:
        threshold = rule.min_clients_threshold or 0
        extra_clients = max(0, attended_count - threshold)
        extra_amount = extra_clients * (rule.extra_client_amount_minor or 0)
        return extra_clients, extra_amount, rule.base_amount_minor + extra_amount
    return 0, 0, rule.base_amount_minor


@transaction.atomic
def calculate_payroll_period(*, date_from, date_to, location="", actor=None,
                             replace_existing=True):
    period, created = PayrollPeriod.objects.get_or_create(
        date_from=date_from,
        date_to=date_to,
        location=location or "",
    )
    if not created and period.status in {PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.EXPORTED}:
        raise ValidationError("approved/exported payroll period cannot be recalculated")
    if replace_existing:
        period.calculations.all().delete()

    qs = (Session.objects
          .filter(is_cancelled=False, start_at__date__gte=date_from,
                  start_at__date__lte=date_to)
          .select_related("trainer__user", "substitute_trainer__user")
          .annotate(attended_clients_count=Count(
              "attendance",
              filter=Q(attendance__status__in=DEDUCTING_STATUSES),
              distinct=True,
          ))
          .order_by("start_at", "id"))
    if location:
        qs = qs.filter(location=location)

    calculations = []
    currency = None
    total = 0
    skipped = []
    for session in qs:
        session_date = session.start_at.date()
        trainer = session.effective_trainer
        assignment = _assignment_for(trainer, session_date)
        if assignment is None:
            skipped.append({"session_id": session.id, "reason": "missing_assignment"})
            continue
        rule = _rule_for(assignment, session.session_type)
        if rule is None:
            skipped.append({"session_id": session.id, "reason": "missing_rule"})
            continue
        if currency and currency != rule.currency:
            raise ValidationError("payroll period cannot mix currencies")
        currency = currency or rule.currency
        attended_count = session.attended_clients_count or 0
        extra_clients, extra_amount, final_amount = _amounts(rule, attended_count)
        calculations.append(PayrollCalculation(
            period=period,
            trainer=trainer,
            session=session,
            rule=rule,
            attended_clients_count=attended_count,
            base_amount_minor=rule.base_amount_minor,
            extra_clients_count=extra_clients,
            extra_amount_minor=extra_amount,
            final_amount_minor=final_amount,
            currency=rule.currency,
        ))
        total += final_amount

    PayrollCalculation.objects.bulk_create(calculations)
    period.status = PayrollPeriodStatus.CALCULATED
    period.full_clean()
    period.save(update_fields=["status", "updated_at"])
    if actor is not None:
        audit(actor, "payroll.calculated", period, {
            "calculations": len(calculations),
            "skipped": skipped,
            "total_amount_minor": total,
            "currency": currency,
        })
    return PayrollSummary(
        period=period,
        calculations_count=len(calculations),
        total_amount_minor=total,
        currency=currency or "",
    )


def payroll_totals_by_trainer(period):
    return list(period.calculations
                .values("trainer_id", "trainer__user__first_name",
                        "trainer__user__last_name", "currency")
                .annotate(
                    sessions_count=Count("id"),
                    total_amount_minor=Sum("final_amount_minor"),
                )
                .order_by("trainer__user__last_name", "trainer__user__first_name",
                          "trainer_id"))
