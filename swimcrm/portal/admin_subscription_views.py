from .support import *
import hashlib
import json
from datetime import timedelta

from django.db import IntegrityError
from django.db.models import IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from subscriptions.models import SessionLedgerEntry

from .admin_support import _admin_required
from .pagination import choice_param, paginated_payload, positive_int_param, search_param


class _IdempotencyConflict(Exception):
    pass


SUBSCRIPTION_CATEGORIES = {
    "active", "ending_soon", "depleted", "expired_remaining", "future", "history",
}


def _list_remaining(subscription):
    if subscription.subscription_type.is_unlimited:
        return None
    return subscription.list_remaining_sessions or 0


def _subscription_list_state(subscription, today):
    remaining = _list_remaining(subscription)
    end = subscription.effective_end_date
    cancelled = subscription.status == SubscriptionStatus.CANCELLED
    current_status = subscription.status in {
        SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN,
    }
    active = not cancelled and current_status and subscription.start_date <= today <= end
    return {
        "active": active,
        "ending_soon": active and today <= end <= today + timedelta(days=7),
        "depleted": active and remaining is not None and remaining <= 0,
        "expired_remaining": not cancelled and end < today and (remaining or 0) > 0,
        "future": not cancelled and current_status and subscription.start_date > today,
        "history": cancelled or end < today,
    }


def _subscription_allowed_actions(subscription, today):
    actions = ["open_client"]
    if subscription.status == SubscriptionStatus.CANCELLED:
        return actions
    actions.append("renew")
    remaining = _list_remaining(subscription)
    official_active = (
        subscription.status in {SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN}
        and subscription.start_date <= today <= subscription.effective_end_date
    )
    if official_active and subscription.status == SubscriptionStatus.ACTIVE:
        actions.append("freeze")
    if official_active or (subscription.effective_end_date < today and (remaining or 0) > 0):
        actions.append("adjust")
    return actions


def _subscription_admin_list_payload(subscription, today):
    student = subscription.student
    groups = sorted(student.groups.all(), key=lambda group: (group.name, group.id))
    return {
        **_subscription_payload(subscription),
        "client_id": student.parent_id,
        "participant_name": student.full_name,
        "phone": student.parent.phone,
        "groups": [{"id": group.id, "name": group.name} for group in groups],
        "remaining_sessions": _list_remaining(subscription),
        "allowed_actions": _subscription_allowed_actions(subscription, today),
    }


@require_GET
def admin_subscriptions(request):
    _admin_required(request)
    category = choice_param(
        request, "category", SUBSCRIPTION_CATEGORIES, default="active", allow_blank=False)
    subscription_type_id = positive_int_param(request, "subscription_type_id")
    group_id = positive_int_param(request, "group_id")
    end_from = _parse_date(request.GET.get("end_from"), "end_from")
    end_to = _parse_date(request.GET.get("end_to"), "end_to")
    if end_from and end_to and end_to < end_from:
        raise _field_validation_error(
            "end_to", "Дата окончания диапазона не может быть раньше начала.",
            code="invalid_range")

    remaining_subquery = SessionLedgerEntry.objects.filter(
        subscription_id=OuterRef("pk"),
    ).values("subscription_id").annotate(total=Sum("delta")).values("total")[:1]
    rows = Subscription.objects.select_related(
        "student", "student__parent", "student__parent__user", "subscription_type",
    ).prefetch_related(
        "freeze_periods", "student__groups",
    ).annotate(
        list_remaining_sessions=Coalesce(
            Subquery(remaining_subquery, output_field=IntegerField()), Value(0)),
    )
    q = search_param(request)
    if q:
        rows = rows.filter(
            Q(student__first_name__icontains=q)
            | Q(student__last_name__icontains=q)
            | Q(student__email__icontains=q)
            | Q(student__parent__phone__icontains=q)
            | Q(student__parent__email__icontains=q)
            | Q(student__parent__user__first_name__icontains=q)
            | Q(student__parent__user__last_name__icontains=q)
            | Q(student__parent__user__email__icontains=q)
            | Q(student__groups__name__icontains=q)
        )
    if subscription_type_id:
        rows = rows.filter(subscription_type_id=subscription_type_id)
    if group_id:
        rows = rows.filter(student__groups__id=group_id)
    rows = list(rows.distinct())
    today = timezone.localdate()
    if end_from:
        rows = [row for row in rows if row.effective_end_date >= end_from]
    if end_to:
        rows = [row for row in rows if row.effective_end_date <= end_to]

    states = {row.id: _subscription_list_state(row, today) for row in rows}
    counts = {
        key: sum(1 for row in rows if states[row.id][key])
        for key in SUBSCRIPTION_CATEGORIES
    }
    selected = [row for row in rows if states[row.id][category]]
    if category == "expired_remaining":
        selected.sort(key=lambda row: (row.effective_end_date, row.id))
    elif category == "history":
        selected.sort(key=lambda row: (row.created_at, row.id), reverse=True)
    elif category == "future":
        selected.sort(key=lambda row: (row.start_date, row.id))
    else:
        selected.sort(key=lambda row: (row.effective_end_date, row.id))
    return JsonResponse(paginated_payload(
        request,
        selected,
        key="subscriptions",
        serializer=lambda row: _subscription_admin_list_payload(row, today),
        extra={"counts": counts},
    ))


def _operation_key(data):
    value = data.get("idempotency_key")
    if value is None:
        raise _field_validation_error(
            "idempotency_key",
            "Передайте ключ идемпотентности для безопасного повтора операции.",
            code="required",
        )
    if not isinstance(value, str):
        raise _field_validation_error(
            "idempotency_key",
            "Ключ идемпотентности должен быть строкой длиной до 128 символов.",
            code="invalid",
        )
    key = value.strip()
    if not key:
        raise _field_validation_error(
            "idempotency_key",
            "Передайте ключ идемпотентности для безопасного повтора операции.",
            code="required",
        )
    if len(key) > 128:
        raise _field_validation_error(
            "idempotency_key",
            "Ключ идемпотентности должен быть строкой длиной до 128 символов.",
            code="invalid",
        )
    return key


def _operation_fingerprint(*, operation, student_id, source_subscription_id,
                           subscription_type_id, start_date, due_date):
    canonical = json.dumps({
        "operation": operation,
        "student_id": student_id,
        "source_subscription_id": source_subscription_id,
        "subscription_type_id": subscription_type_id,
        "start_date": str(start_date),
        "due_date": str(due_date),
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _existing_operation(key, fingerprint):
    if key is None:
        return None
    existing = Subscription.objects.select_related(
        "student", "student__parent__user", "subscription_type",
    ).filter(idempotency_key=key).first()
    if existing is None:
        return None
    if existing.idempotency_fingerprint != fingerprint:
        raise _IdempotencyConflict
    return existing


def _operation_payload(subscription, *, replayed):
    charge = subscription.charges.get()
    return {
        "subscription": _subscription_detail_payload(subscription),
        "charge": _charge_payload(charge),
        "replayed": replayed,
    }


def _idempotency_conflict_response():
    return JsonResponse({
        "error": "Ключ идемпотентности уже использован с другими данными.",
        "code": "idempotency_conflict",
    }, status=409)

@require_http_methods(["GET", "POST"])
def admin_participant_subscriptions(request, participant_id):
    user = _admin_required(request)
    participant = get_object_or_404(
        Student.objects.select_related("parent").prefetch_related("groups"),
        pk=participant_id)
    if request.method == "POST":
        data = _json_body(request)
        subscription_type_id = _positive_int(
            data.get("subscription_type_id"), "subscription_type_id")
        start_date = _parse_date(data.get("start_date"), "start_date") or timezone.localdate()
        due_date = _parse_date(data.get("due_date"), "due_date") or start_date
        key = _operation_key(data)
        fingerprint = _operation_fingerprint(
            operation="purchase",
            student_id=participant.id,
            source_subscription_id=None,
            subscription_type_id=subscription_type_id,
            start_date=(data.get("start_date") or "__default__"),
            due_date=(data.get("due_date") or "__default__"),
        )
        try:
            existing = _existing_operation(key, fingerprint)
            if existing is not None:
                return JsonResponse(
                    _operation_payload(existing, replayed=True), status=200)
            _require_active_participant(
                participant, "receive new subscriptions", field="participant_id")
            subscription_type = _object_for_field(
                SubscriptionType.objects.filter(is_active=True),
                subscription_type_id, "subscription_type_id",
                "тип абонемента")
            try:
                with transaction.atomic():
                    subscription = create_subscription(
                        student=participant, subscription_type=subscription_type,
                        start_date=start_date, created_by=user)
                    if key is not None:
                        subscription.idempotency_key = key
                        subscription.idempotency_fingerprint = fingerprint
                        subscription.save(update_fields=[
                            "idempotency_key", "idempotency_fingerprint"])
                    _create_subscription_charge(
                        subscription, actor=user, due_date=due_date)
            except IntegrityError:
                existing = _existing_operation(key, fingerprint)
                if existing is None:
                    raise
                return JsonResponse(
                    _operation_payload(existing, replayed=True), status=200)
        except _IdempotencyConflict:
            return _idempotency_conflict_response()
        return JsonResponse(
            _operation_payload(subscription, replayed=False), status=201)
    qs = participant.subscriptions.select_related("subscription_type").order_by("-start_date", "-id")
    return JsonResponse({"subscriptions": [_subscription_payload(subscription) for subscription in qs]})


@require_http_methods(["GET", "POST"])
def admin_subscription_detail(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "student__parent__user", "subscription_type"),
        pk=subscription_id)
    if request.method == "POST":
        _require_active_participant(subscription.student, "have subscriptions edited")
        data = _json_body(request)
        status = data.get("status")
        if status not in SubscriptionStatus.values:
            raise _field_validation_error(
                "status", "Выберите допустимый статус абонемента.",
                code="invalid_choice")
        subscription.status = status
        subscription.save(update_fields=["status"])
        audit(user, "subscription.updated", subscription, {"status": status})
    return JsonResponse(_subscription_detail_payload(subscription))


@require_POST
def admin_subscription_renew(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "student__parent__user", "subscription_type"),
        pk=subscription_id)
    data = _json_body(request)
    subscription_type_id = (
        _positive_int(data.get("subscription_type_id"), "subscription_type_id")
        if data.get("subscription_type_id")
        else subscription.subscription_type_id
    )
    start_date = _parse_date(data.get("start_date"), "start_date") or timezone.localdate()
    due_date = _parse_date(data.get("due_date"), "due_date") or start_date
    key = _operation_key(data)
    fingerprint = _operation_fingerprint(
        operation="renewal",
        student_id=subscription.student_id,
        source_subscription_id=subscription.id,
        subscription_type_id=subscription_type_id,
        start_date=(data.get("start_date") or "__default__"),
        due_date=(data.get("due_date") or "__default__"),
    )
    try:
        existing = _existing_operation(key, fingerprint)
        if existing is not None:
            return JsonResponse(
                _operation_payload(existing, replayed=True), status=200)
        _require_active_participant(subscription.student, "renew subscriptions")
        subscription_type = _object_for_field(
            SubscriptionType.objects.filter(is_active=True),
            subscription_type_id, "subscription_type_id",
            "тип абонемента")
        try:
            with transaction.atomic():
                new_subscription = renew_subscription(
                    subscription=subscription, subscription_type=subscription_type,
                    start_date=start_date, created_by=user)
                if key is not None:
                    new_subscription.idempotency_key = key
                    new_subscription.idempotency_fingerprint = fingerprint
                    new_subscription.save(update_fields=[
                        "idempotency_key", "idempotency_fingerprint"])
                _create_subscription_charge(
                    new_subscription, actor=user, due_date=due_date)
        except IntegrityError:
            existing = _existing_operation(key, fingerprint)
            if existing is None:
                raise
            return JsonResponse(
                _operation_payload(existing, replayed=True), status=200)
    except _IdempotencyConflict:
        return _idempotency_conflict_response()
    return JsonResponse(
        _operation_payload(new_subscription, replayed=False), status=201)


@require_POST
def admin_subscription_freeze(request, subscription_id):
    user = _admin_required(request)
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "student__parent__user"),
        pk=subscription_id)
    _require_active_participant(subscription.student, "freeze subscriptions")
    data = _json_body(request)
    start_date = _parse_date(data.get("start_date"), "start_date")
    end_date = _parse_date(data.get("end_date"), "end_date")
    missing = {}
    if start_date is None:
        missing["start_date"] = ValidationError(
            "Укажите дату начала заморозки.", code="required")
    if end_date is None:
        missing["end_date"] = ValidationError(
            "Укажите дату окончания заморозки.", code="required")
    if missing:
        raise ValidationError(missing)
    if end_date < start_date:
        raise _field_validation_error(
            "end_date", "Дата окончания не может быть раньше даты начала.",
            code="invalid_range")
    freeze = freeze_subscription(
        subscription=subscription,
        start_date=start_date,
        end_date=end_date,
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
    subscription = get_object_or_404(
        Subscription.objects.select_related("student", "student__parent__user"),
        pk=subscription_id)
    _require_active_participant(subscription.student, "receive subscription adjustments")
    data = _json_body(request)
    delta = _required_int(data.get("delta"), "delta")
    entry = manual_adjust(
        subscription=subscription,
        delta=delta,
        note=data.get("note", "") or "",
        created_by=user,
    )
    return JsonResponse({
        "entry": _ledger_entry_payload(entry),
        "subscription": _subscription_detail_payload(subscription),
    }, status=201)


