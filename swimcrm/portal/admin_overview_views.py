from .support import *
from .admin_support import _admin_required
import re

from scheduling.models import Location, SessionTypeConfig

@require_GET
def admin_api_contract(request):
    _admin_required(request)
    from .openapi import build_openapi_schema
    schema = build_openapi_schema()
    # Keep the legacy flat list during the OpenAPI migration so older
    # operational clients can discover routes without maintaining a second
    # hand-written contract.
    schema["endpoints"] = [
        {
            "method": method.upper(),
            "path": re.sub(r"\{[^}]+_id\}", "<id>", path),
        }
        for path, operations in schema["paths"].items()
        for method in operations
    ]
    return JsonResponse(schema)


@require_GET
def admin_reference(request):
    _admin_required(request)
    q = request.GET.get("q", "").strip()
    participants = Student.objects.select_related(
        "parent", "parent__user"
    ).prefetch_related("groups").filter(is_active=True, parent__user__is_active=True)
    if q:
        for token in q.split():
            participants = participants.filter(
                Q(first_name__icontains=token) | Q(last_name__icontains=token) |
                Q(parent__phone__icontains=token) | Q(parent__email__icontains=token) |
                Q(email__icontains=token) |
                Q(parent__user__first_name__icontains=token) |
                Q(parent__user__last_name__icontains=token) |
                Q(parent__user__username__icontains=token)
            )
    session_type_configs = list(SessionTypeConfig.objects.filter(is_active=True).order_by("code", "id"))
    session_type_choices = (
        [{"value": row.code, "label": row.label, "default_capacity": row.default_capacity}
         for row in session_type_configs]
        or [{"value": value, "label": label, "default_capacity": None} for value, label in SessionType.choices]
    )
    return JsonResponse({
        "trainers": [_trainer_payload(trainer) for trainer in
                     Trainer.objects.select_related("user").filter(is_active=True).order_by("user__last_name", "id")],
        "groups": [_group_payload(group) for group in
                   Group.objects.select_related(
                       "default_trainer__user", "default_location"
                   ).filter(is_active=True).order_by("name", "id")],
        "subscription_types": [_subscription_type_payload(stype) for stype in
                               SubscriptionType.objects.filter(is_active=True).order_by("name", "id")],
        "locations": [
            {
                "id": location.id,
                "code": location.code,
                "name": location.name,
                "address": location.address,
                "timezone": location.timezone,
            }
            for location in Location.objects.filter(is_active=True).order_by("name", "id")
        ],
        "participants": [_student_payload(participant) for participant in
                         participants.order_by("last_name", "first_name", "id")],
        "choices": {
            "payment_methods": [{"value": value, "label": label} for value, label in PaymentMethod.choices],
            "payment_statuses": [{"value": value, "label": label} for value, label in PaymentStatus.choices],
            "subscription_statuses": [{"value": value, "label": label} for value, label in SubscriptionStatus.choices],
            "session_types": session_type_choices,
        },
    })


@require_GET
def admin_readiness(request):
    _admin_required(request)
    from common.readiness import build_readiness_report

    report = build_readiness_report()
    return JsonResponse(report, status=200 if report["ok"] else 503)


@require_GET
def admin_ops_status(request):
    _admin_required(request)
    from common.ops_status import build_ops_status

    return JsonResponse(build_ops_status())
@require_GET
def admin_dashboard(request):
    _admin_required(request)
    today = timezone.localdate()
    active_participant = {
        "student__is_active": True,
        "student__parent__user__is_active": True,
    }
    pending_payments = Payment.objects.filter(
        status=PaymentStatus.PENDING,
        **active_participant,
    )
    overdue_charges = Charge.objects.filter(
        due_date__lt=today,
        **active_participant,
    )
    confirmed_payments_today = Payment.objects.filter(
        status=PaymentStatus.CONFIRMED,
        confirmed_at__date=today,
        **active_participant,
    )
    debtor_rows = debtors()
    upcoming_rows = upcoming(within_days=7)
    return JsonResponse({
        "clients": {
            "accounts": ParentAccount.objects.filter(user__is_active=True).count(),
            "participants": Student.objects.filter(
                is_active=True, parent__user__is_active=True).count(),
            "active_participants": Student.objects.filter(
                is_active=True, parent__user__is_active=True).count(),
            "adult_account_holders": Student.objects.filter(
                is_account_holder=True, is_active=True,
                parent__user__is_active=True).count(),
        },
        "operations": {
            "active_trainers": Trainer.objects.filter(is_active=True).count(),
            "active_groups": Group.objects.filter(is_active=True).count(),
            "sessions_today": Session.objects.filter(start_at__date=today, is_cancelled=False).count(),
            "cancelled_sessions_today": Session.objects.filter(start_at__date=today, is_cancelled=True).count(),
        },
        "finance": {
            "pending_payments": pending_payments.count(),
            "pending_payments_minor": pending_payments.aggregate(total=Sum("amount_minor"))["total"] or 0,
            "confirmed_today_minor": confirmed_payments_today.aggregate(total=Sum("amount_minor"))["total"] or 0,
            "overdue_charges": overdue_charges.count(),
            "overdue_charges_minor": overdue_charges.aggregate(total=Sum("amount_minor"))["total"] or 0,
            "debtors": len(debtor_rows),
        },
        "subscriptions": {
            "active": Subscription.objects.filter(
                status=SubscriptionStatus.ACTIVE,
                student__is_active=True,
                student__parent__user__is_active=True,
            ).count(),
            "frozen": Subscription.objects.filter(
                status=SubscriptionStatus.FROZEN,
                student__is_active=True,
                student__parent__user__is_active=True,
            ).count(),
            "upcoming_expiry": len(upcoming_rows),
        },
    })


