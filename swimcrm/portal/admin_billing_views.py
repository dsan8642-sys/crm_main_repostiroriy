from .support import *
from .admin_support import _admin_required

@require_http_methods(["GET", "POST"])
def admin_participant_charges(request, participant_id):
    user = _admin_required(request)
    participant = get_object_or_404(Student.objects.select_related("parent", "group"), pk=participant_id)
    if request.method == "POST":
        charge = _create_charge_for_participant(participant, _json_body(request), actor=user)
        return JsonResponse(_charge_payload(charge), status=201)
    qs = participant.charges.select_related("student", "subscription").order_by("-due_date", "-id")
    return JsonResponse({"charges": [_charge_payload(charge) for charge in qs]})


@require_http_methods(["GET", "POST"])
def admin_payments(request):
    user = _admin_required(request)
    if request.method == "POST":
        data = _json_body(request)
        participant = get_object_or_404(Student, pk=_payment_data(data).get("participant_id") or _payment_data(data).get("student_id"))
        payment = _create_payment_for_participant(participant, data, actor=user)
        return JsonResponse(_payment_payload(payment), status=201)
    qs = Payment.objects.select_related("student", "confirmed_by").order_by("-paid_at", "-id")
    if request.GET.get("participant_id"):
        qs = qs.filter(student_id=request.GET["participant_id"])
    if request.GET.get("status"):
        qs = qs.filter(status=request.GET["status"])
    return JsonResponse({"payments": [_payment_payload(payment) for payment in qs[:200]]})


@require_http_methods(["GET", "POST"])
def admin_payment_detail(request, payment_id):
    user = _admin_required(request)
    payment = get_object_or_404(Payment.objects.select_related("student", "confirmed_by"), pk=payment_id)
    if request.method == "POST":
        data = _payment_data(_json_body(request))
        changed_fields = []
        changes = {}
        if "method" in data:
            method = normalize_payment_method(data["method"])
            if method not in PaymentMethod.values:
                raise ValidationError("invalid payment method")
            if payment.method != method:
                changes["method"] = {"from": payment.method, "to": method}
                payment.method = method
                changed_fields.append("method")
        if "comment" in data:
            comment = data.get("comment", "") or ""
            if payment.comment != comment:
                changes["comment_changed"] = True
                payment.comment = comment
                changed_fields.append("comment")
        if changed_fields:
            payment.save(update_fields=changed_fields)
            audit(user, "payment.updated", payment, {
                "fields": sorted(changed_fields),
                "changes": changes,
            })
    return JsonResponse(_payment_payload(payment))


@require_POST
def admin_payment_confirm(request, payment_id):
    user = _admin_required(request)
    payment = get_object_or_404(Payment, pk=payment_id)
    confirm_payment(payment, user)
    return JsonResponse(_payment_payload(payment))


@require_POST
def admin_payment_reject(request, payment_id):
    user = _admin_required(request)
    payment = get_object_or_404(Payment, pk=payment_id)
    data = _json_body(request)
    reject_payment(payment, user, data.get("reason", "") or "")
    return JsonResponse(_payment_payload(payment))


