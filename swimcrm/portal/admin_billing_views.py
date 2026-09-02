from .support import *
from .admin_support import _admin_required
from .pagination import (
    choice_param,
    ordered_rows,
    paginated_payload,
    positive_int_param,
    search_param,
)


def _payment_for_readback(payment_id):
    return Payment.objects.select_related(
        "student", "student__parent__user", "confirmed_by"
    ).prefetch_related("receipts", "events", "events__actor").get(pk=payment_id)


def _payment_mutation_payload(payment, *, idempotent_replay=False):
    payment = _payment_for_readback(payment.pk)
    payload = _payment_payload(payment)
    balance = student_balance(payment.student)
    payload.update({
        "balance_minor": balance.amount_minor,
        "balance_currency": balance.currency,
        "audit_event": payload["events"][-1] if payload["events"] else None,
        "idempotent_replay": idempotent_replay,
    })
    return payload


def _charge_for_readback(charge_id):
    return Charge.objects.select_related(
        "student", "student__parent__user", "subscription", "attendance",
        "created_by", "reversal", "reversal__created_by",
    ).get(pk=charge_id)


def _charge_mutation_payload(charge, *, idempotent_replay=False):
    charge = _charge_for_readback(charge.pk)
    payload = _charge_payload(charge)
    balance = student_balance(charge.student)
    payload.update({
        "balance_minor": balance.amount_minor,
        "balance_currency": balance.currency,
        "idempotent_replay": idempotent_replay,
    })
    return payload


def _charge_idempotency_conflict_response():
    return JsonResponse({
        "error": "Ключ идемпотентности уже использован с другими данными.",
        "code": "idempotency_conflict",
    }, status=409)


def _require_client_context(participant, data):
    """Fail closed when a client-card mutation targets another account."""
    raw_client_id = data.get("client_id")
    if raw_client_id in (None, ""):
        return participant
    client_id = _positive_int(raw_client_id, "client_id")
    if participant.parent_id != client_id:
        raise _field_validation_error(
            "client_id",
            "Выбранный участник не принадлежит открытой карточке клиента.",
            code="mismatch",
        )
    return participant


@require_http_methods(["GET", "POST"])
def admin_participant_charges(request, participant_id):
    user = _admin_required(request)
    participant = get_object_or_404(
        Student.objects.select_related("parent").prefetch_related("groups"),
        pk=participant_id)
    if request.method == "POST":
        data = _json_body(request)
        _require_client_context(participant, _charge_data(data))
        try:
            charge, created = _create_manual_charge_for_participant(
                participant, data, actor=user)
        except IdempotencyConflict:
            return _charge_idempotency_conflict_response()
        return JsonResponse(
            _charge_mutation_payload(charge, idempotent_replay=not created),
            status=201 if created else 200,
        )
    qs = participant.charges.select_related(
        "student", "subscription", "attendance", "created_by", "reversal",
        "reversal__created_by").order_by("-due_date", "-id")
    return JsonResponse({"charges": [_charge_payload(charge) for charge in qs]})


@require_POST
def admin_charge_reverse(request, charge_id):
    user = _admin_required(request)
    charge = get_object_or_404(
        Charge.objects.select_related("student", "student__parent__user"),
        pk=charge_id,
    )
    data = _json_body(request)
    _require_client_context(charge.student, data)
    try:
        reversal, created = reverse_manual_charge(
            charge=charge,
            actor=user,
            reason=data.get("reason"),
            idempotency_key=data.get("idempotency_key"),
        )
    except IdempotencyConflict:
        return _charge_idempotency_conflict_response()
    return JsonResponse(
        _charge_mutation_payload(
            reversal.charge, idempotent_replay=not created),
        status=201 if created else 200,
    )


@require_http_methods(["GET", "POST"])
def admin_payments(request):
    user = _admin_required(request)
    if request.method == "POST":
        data = _json_body(request)
        payment_data = _payment_data(data)
        participant = _object_for_field(
            Student.objects.select_related("parent__user"),
            payment_data.get("participant_id") or payment_data.get("student_id"),
            "participant_id",
            "участника",
        )
        _require_active_participant(
            participant, "receive new payments", field="participant_id")
        _require_client_context(participant, payment_data)
        payment, created = _create_payment_for_participant(participant, data, actor=user)
        return JsonResponse(
            _payment_mutation_payload(payment, idempotent_replay=not created),
            status=201 if created else 200,
        )
    qs = Payment.objects.select_related(
        "student", "student__parent__user", "confirmed_by").prefetch_related(
        "receipts", "events", "events__actor")
    participant_id = positive_int_param(request, "participant_id")
    if participant_id:
        qs = qs.filter(student_id=participant_id)
    status = choice_param(request, "status", set(PaymentStatus.values))
    if status:
        qs = qs.filter(status=status)
    method = choice_param(request, "method", set(PaymentMethod.values))
    if method:
        qs = qs.filter(method=method)
    source = choice_param(request, "source", {"admin", "client_top_up"})
    if source:
        qs = qs.filter(source=source)
    q = search_param(request)
    if q:
        qs = qs.filter(
            Q(student__first_name__icontains=q) |
            Q(student__last_name__icontains=q) |
            Q(comment__icontains=q)
        )
    qs = ordered_rows(request, qs, allowlist={
        "-date": ("-paid_at", "-id"),
        "date": ("paid_at", "id"),
        "-amount": ("-amount_minor", "-id"),
        "amount": ("amount_minor", "id"),
        "status": ("status", "-paid_at", "-id"),
        "-status": ("-status", "-paid_at", "-id"),
    }, default="-date")
    return JsonResponse(paginated_payload(
        request, qs, key="payments", serializer=_payment_payload))


@require_http_methods(["GET", "POST"])
def admin_payment_detail(request, payment_id):
    user = _admin_required(request)
    payment = get_object_or_404(
        Payment.objects.select_related(
            "student", "student__parent__user", "confirmed_by").prefetch_related(
            "receipts", "events", "events__actor"),
        pk=payment_id)
    if request.method == "POST":
        data = _payment_data(_json_body(request))
        changed_fields = []
        changes = {}
        if "method" in data:
            method = normalize_payment_method(data["method"])
            if method not in PaymentMethod.values:
                raise _field_validation_error(
                    "method", "Выберите допустимый способ оплаты.",
                    code="invalid_choice")
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
    payment = confirm_payment(payment, user)
    return JsonResponse(_payment_mutation_payload(payment))


@require_POST
def admin_payment_reject(request, payment_id):
    user = _admin_required(request)
    payment = get_object_or_404(Payment, pk=payment_id)
    data = _json_body(request)
    payment = reject_payment(payment, user, data.get("reason", "") or "")
    return JsonResponse(_payment_mutation_payload(payment))


