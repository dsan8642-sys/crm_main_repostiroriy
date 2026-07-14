from .support import *
from .admin_support import _admin_required

@require_GET
def admin_api_contract(request):
    _admin_required(request)
    return JsonResponse(API_CONTRACT)


@require_GET
def admin_reference(request):
    _admin_required(request)
    q = request.GET.get("q", "").strip()
    participants = Student.objects.select_related("parent", "group").filter(is_active=True)
    if q:
        participants = participants.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) |
            Q(parent__phone__icontains=q) | Q(parent__email__icontains=q) |
            Q(email__icontains=q)
        )
    return JsonResponse({
        "trainers": [_trainer_payload(trainer) for trainer in
                     Trainer.objects.select_related("user").filter(is_active=True).order_by("user__last_name", "id")],
        "groups": [_group_payload(group) for group in
                   Group.objects.select_related("default_trainer__user").filter(is_active=True).order_by("name", "id")],
        "subscription_types": [_subscription_type_payload(stype) for stype in
                               SubscriptionType.objects.filter(is_active=True).order_by("name", "id")],
        "participants": [_student_payload(participant) for participant in
                         participants.order_by("last_name", "first_name", "id")[:100]],
        "choices": {
            "payment_methods": [{"value": value, "label": label} for value, label in PaymentMethod.choices],
            "payment_statuses": [{"value": value, "label": label} for value, label in PaymentStatus.choices],
            "subscription_statuses": [{"value": value, "label": label} for value, label in SubscriptionStatus.choices],
            "session_types": [{"value": value, "label": label} for value, label in SessionType.choices],
        },
    })


@require_GET
def admin_dashboard(request):
    _admin_required(request)
    today = timezone.localdate()
    pending_payments = Payment.objects.filter(status=PaymentStatus.PENDING)
    overdue_charges = Charge.objects.filter(due_date__lt=today)
    confirmed_payments_today = Payment.objects.filter(
        status=PaymentStatus.CONFIRMED, confirmed_at__date=today)
    debtor_rows = debtors()
    upcoming_rows = upcoming(within_days=7)
    return JsonResponse({
        "clients": {
            "accounts": ParentAccount.objects.count(),
            "participants": Student.objects.count(),
            "active_participants": Student.objects.filter(is_active=True).count(),
            "adult_account_holders": Student.objects.filter(is_account_holder=True, is_active=True).count(),
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
            "active": Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count(),
            "frozen": Subscription.objects.filter(status=SubscriptionStatus.FROZEN).count(),
            "upcoming_expiry": len(upcoming_rows),
        },
    })


