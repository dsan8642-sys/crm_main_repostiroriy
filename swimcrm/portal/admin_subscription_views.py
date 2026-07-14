from .support import *
from .admin_support import _admin_required

@require_http_methods(["GET", "POST"])
def admin_participant_subscriptions(request, participant_id):
    user = _admin_required(request)
    participant = get_object_or_404(Student.objects.select_related("parent", "group"), pk=participant_id)
    if request.method == "POST":
        data = _json_body(request)
        subscription_type = get_object_or_404(SubscriptionType, pk=data.get("subscription_type_id"))
        start_date = _parse_date(data.get("start_date"), "start_date") or timezone.localdate()
        with transaction.atomic():
            subscription = create_subscription(
                student=participant, subscription_type=subscription_type,
                start_date=start_date, created_by=user)
            charge = None
            if _bool_value(data.get("create_charge"), True):
                due_date = _parse_date(data.get("due_date"), "due_date") or start_date
                charge = _create_subscription_charge(subscription, actor=user, due_date=due_date)
        payload = {"subscription": _subscription_detail_payload(subscription)}
        if charge:
            payload["charge"] = _charge_payload(charge)
        return JsonResponse(payload, status=201)
    qs = participant.subscriptions.select_related("subscription_type").order_by("-start_date", "-id")
    return JsonResponse({"subscriptions": [_subscription_payload(subscription) for subscription in qs]})


@require_http_methods(["GET", "POST"])
def admin_subscription_detail(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "student__parent", "subscription_type"),
        pk=subscription_id)
    if request.method == "POST":
        data = _json_body(request)
        status = data.get("status")
        if status not in SubscriptionStatus.values:
            raise ValidationError("invalid subscription status")
        subscription.status = status
        subscription.save(update_fields=["status"])
        audit(user, "subscription.updated", subscription, {"status": status})
    return JsonResponse(_subscription_detail_payload(subscription))


@require_POST
def admin_subscription_renew(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "subscription_type"), pk=subscription_id)
    data = _json_body(request)
    subscription_type = subscription.subscription_type
    if data.get("subscription_type_id"):
        subscription_type = get_object_or_404(SubscriptionType, pk=data.get("subscription_type_id"))
    start_date = _parse_date(data.get("start_date"), "start_date") or timezone.localdate()
    with transaction.atomic():
        new_subscription = renew_subscription(
            subscription=subscription, subscription_type=subscription_type,
            start_date=start_date, created_by=user)
        charge = None
        if _bool_value(data.get("create_charge"), True):
            due_date = _parse_date(data.get("due_date"), "due_date") or start_date
            charge = _create_subscription_charge(new_subscription, actor=user, due_date=due_date)
    payload = {"subscription": _subscription_detail_payload(new_subscription)}
    if charge:
        payload["charge"] = _charge_payload(charge)
    return JsonResponse(payload, status=201)


@require_POST
def admin_subscription_freeze(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(Subscription, pk=subscription_id)
    data = _json_body(request)
    freeze = freeze_subscription(
        subscription=subscription,
        start_date=_parse_date(data.get("start_date"), "start_date"),
        end_date=_parse_date(data.get("end_date"), "end_date"),
        reason=data.get("reason", "") or "",
        created_by=user,
    )
    return JsonResponse({
        "id": freeze.id,
        "subscription": _subscription_detail_payload(subscription),
        "start_date": freeze.start_date.isoformat(),
        "end_date": freeze.end_date.isoformat(),
        "days": freeze.days,
        "reason": freeze.reason,
    }, status=201)


@require_POST
def admin_subscription_adjust(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(Subscription, pk=subscription_id)
    data = _json_body(request)
    entry = manual_adjust(
        subscription=subscription,
        delta=int(data.get("delta")),
        note=data.get("note", "") or "",
        created_by=user,
    )
    return JsonResponse({
        "entry": _ledger_entry_payload(entry),
        "subscription": _subscription_detail_payload(subscription),
    }, status=201)


