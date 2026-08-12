from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload
from datetime import timedelta

from django.db.models import Max


def _client_list_balances(students):
    student_ids = [student.id for student in students]
    charged = {
        row["student_id"]: row["total"] or 0
        for row in Charge.objects.filter(
            student_id__in=student_ids,
            currency=settings.DEFAULT_CURRENCY,
        ).values("student_id").annotate(total=Sum("amount_minor"))
    }
    paid = {
        row["student_id"]: row["total"] or 0
        for row in Payment.objects.filter(
            student_id__in=student_ids,
            currency=settings.DEFAULT_CURRENCY,
            status=PaymentStatus.CONFIRMED,
        ).values("student_id").annotate(total=Sum("amount_minor"))
    }
    return {
        student_id: charged.get(student_id, 0) - paid.get(student_id, 0)
        for student_id in student_ids
    }


def _client_current_subscriptions(students):
    current = {student.id: None for student in students}
    today = timezone.localdate()
    subscriptions = Subscription.objects.filter(
        student_id__in=current,
        status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN],
    ).select_related("subscription_type").prefetch_related(
        "freeze_periods"
    ).annotate(
        list_remaining_sessions=Sum("ledger_entries__delta")
    ).order_by("student_id", "-start_date", "-id")
    for subscription in subscriptions:
        if current[subscription.student_id] is not None:
            continue
        if subscription.is_active_on(today):
            is_unlimited = subscription.subscription_type.is_unlimited
            current[subscription.student_id] = {
                "remaining": (
                    None if is_unlimited
                    else subscription.list_remaining_sessions or 0
                ),
                "total": (
                    None if is_unlimited
                    else subscription.subscription_type.sessions_count
                ),
                "is_unlimited": is_unlimited,
            }
    return current


def _client_recent_attendance(students):
    now = timezone.now()
    rows = AttendanceRecord.objects.filter(
        student_id__in=[student.id for student in students],
        status=AttendanceStatus.PRESENT,
        session__is_cancelled=False,
        session__start_at__lte=now,
    ).values("student_id").annotate(last_present_at=Max("session__start_at"))
    return (
        {row["student_id"]: row["last_present_at"] for row in rows},
        now - timedelta(days=60),
    )


def _client_list_payload(
        student, balances, current_subscriptions, recent_attendance,
        activity_cutoff):
    last_present_at = recent_attendance.get(student.id)
    current_subscription = current_subscriptions.get(student.id)
    return {
        **_student_payload(student),
        "balance_minor": balances.get(student.id, 0),
        "currency": settings.DEFAULT_CURRENCY,
        "has_current_subscription": current_subscription is not None,
        "current_subscription_remaining": (
            current_subscription["remaining"] if current_subscription else None
        ),
        "current_subscription_total": (
            current_subscription["total"] if current_subscription else None
        ),
        "current_subscription_is_unlimited": (
            current_subscription["is_unlimited"]
            if current_subscription else False
        ),
        "last_present_at": (
            timezone.localtime(last_present_at).isoformat()
            if last_present_at else None
        ),
        "is_recently_active": bool(
            last_present_at and last_present_at >= activity_cutoff),
    }

@require_http_methods(["GET", "POST"])
def admin_clients(request):
    user = _admin_required(request)
    if request.method != "GET":
        data = _json_body(request)
        data["_actor"] = user
        with transaction.atomic():
            account = _create_account(data)
            participant_data = _participant_data(data)
            if "is_adult" in data:
                is_adult = _bool_value(data.get("is_adult"), True)
            elif "is_account_holder" in participant_data:
                is_adult = _bool_value(
                    participant_data.get("is_account_holder"), True)
            else:
                is_adult = True
            if is_adult:
                participant = _create_participant(account, data, is_account_holder=True)
                audit(user, "participant.created", participant, {"client_id": account.id, "is_account_holder": True})
            elif participant_data:
                participant = _create_participant(account, data, is_account_holder=False)
                audit(user, "participant.created", participant, {"client_id": account.id, "is_account_holder": False})
        return JsonResponse(_client_detail_payload(account), status=201)

    qs = Student.objects.select_related("parent", "parent__user", "group", "group__default_trainer__user").all()
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q) |
            Q(parent__phone__icontains=q) | Q(parent__email__icontains=q) |
            Q(group__name__icontains=q) |
            Q(group__default_trainer__user__first_name__icontains=q) |
            Q(group__default_trainer__user__last_name__icontains=q)
        )
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    if request.GET.get("trainer_id"):
        qs = qs.filter(group__default_trainer_id=request.GET["trainer_id"])
    debt = request.GET.get("debt")
    # distinct(): the `q` filter joins group__default_trainer__user, which can
    # emit one row per join match and eat slots inside the cap.
    students = list(qs.distinct().order_by("last_name", "first_name", "id"))
    if debt in {"yes", "no"}:
        filtered = []
        for student in students:
            has_debt = student_balance(student).amount_minor > 0 or any(cs.is_overdue for cs in charge_statuses(student))
            if (debt == "yes" and has_debt) or (debt == "no" and not has_debt):
                filtered.append(student)
        students = filtered
    balances = _client_list_balances(students)
    current_subscriptions = _client_current_subscriptions(students)
    recent_attendance, activity_cutoff = _client_recent_attendance(students)
    return JsonResponse(paginated_payload(
        request,
        students,
        key="clients",
        serializer=lambda student: _client_list_payload(
            student,
            balances,
            current_subscriptions,
            recent_attendance,
            activity_cutoff,
        ),
    ))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_client_detail(request, client_id):
    user = _admin_required(request)
    account = get_object_or_404(ParentAccount.objects.select_related("user"), pk=client_id)
    if request.method == "DELETE":
        with transaction.atomic():
            account.user.is_active = False
            account.user.save(update_fields=["is_active"])
            account.students.update(is_active=False)
            invalidated = _invalidate_access_codes(account.user)
            audit(user, "client_account.archived", account, {
                "source": "api",
                "invalidated_codes": invalidated,
            })
        return JsonResponse(_client_detail_payload(account))
    if request.method != "GET":
        if not account.user.is_active:
            raise ValidationError("archived client account cannot be edited")
        data = _json_body(request)
        with transaction.atomic():
            _apply_account_data(account, data)
            audit(user, "client_account.updated", account, {"fields": sorted(_account_data(data).keys())})
        return JsonResponse(_client_detail_payload(account))
    return JsonResponse(_client_detail_payload(account))


@require_POST
def admin_client_restore(request, client_id):
    user = _admin_required(request)
    account = get_object_or_404(ParentAccount.objects.select_related("user"), pk=client_id)
    with transaction.atomic():
        account.user.is_active = True
        account.user.save(update_fields=["is_active"])
        restored_participants = account.students.filter(is_active=False).update(is_active=True)
        audit(user, "client_account.restored", account, {
            "source": "api",
            "restored_participants": restored_participants,
        })
    return JsonResponse(_client_detail_payload(account))


@require_POST
def admin_client_participants(request, client_id):
    user = _admin_required(request)
    account = get_object_or_404(ParentAccount.objects.select_related("user"), pk=client_id)
    data = _json_body(request)
    is_account_holder = _bool_value(_participant_data(data).get("is_account_holder"))
    with transaction.atomic():
        participant = _create_participant(account, data, is_account_holder=is_account_holder)
        audit(user, "participant.created", participant, {
            "client_id": account.id,
            "is_account_holder": participant.is_account_holder,
        })
    return JsonResponse(_student_payload(participant), status=201)


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_participant_detail(request, participant_id):
    user = _admin_required(request)
    participant = get_object_or_404(Student.objects.select_related("parent", "group"), pk=participant_id)
    if request.method == "DELETE":
        participant.is_active = False
        participant.save(update_fields=["is_active"])
        audit(user, "participant.archived", participant, {"source": "api"})
        return JsonResponse(_student_payload(participant))
    if request.method != "GET":
        _require_active_participant(participant, "be edited")
        data = _json_body(request)
        with transaction.atomic():
            _apply_participant_data(participant, data)
            audit(user, "participant.updated", participant, {"fields": sorted(_participant_data(data).keys())})
        return JsonResponse(_student_payload(participant))
    return JsonResponse(_student_payload(participant))


