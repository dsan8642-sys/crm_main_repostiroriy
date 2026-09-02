from .support import *
from .pagination import (
    choice_param,
    list_contract_requested,
    ordered_rows,
    paginated_payload,
    search_param,
)


@require_http_methods(["GET", "POST"])
def client_profile(request):
    account = _client_account_from_request(request)
    if request.method == "POST":
        data = _json_body(request)
        with transaction.atomic():
            if _account_data(data):
                _apply_client_account_data(account, data)
            participant_data = _participant_data(data)
            if participant_data:
                participant_id = participant_data.get("id") or data.get("participant_id")
                participant = _student_owned_by_client(account, participant_id)
                _apply_client_participant_data(participant, {"participant": participant_data})
        return JsonResponse(_client_safe_detail_payload(account))
    return JsonResponse(_client_safe_detail_payload(account))


@require_http_methods(["GET", "POST"])
def client_consents(request):
    account = _client_account_from_request(request)
    if request.method == "POST":
        data = _json_body(request)
        items = data.get("items")
        if items is None:
            items = [data]
        if not isinstance(items, list) or not items:
            raise ValidationError("items must be a non-empty list")
        if len(items) > len(ConsentType.values):
            raise ValidationError("too many consent items")

        results = []
        seen_types = set()
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                results.append({
                    "index": index, "type": None, "success": False,
                    "error": "consent item must be an object",
                })
                continue
            consent_type = item.get("type")
            try:
                if consent_type not in ConsentType.values:
                    raise ValidationError("invalid consent type")
                if consent_type in seen_types:
                    raise ValidationError("duplicate consent type")
                seen_types.add(consent_type)
                with transaction.atomic():
                    consent, _ = Consent.objects.get_or_create(
                        parent=account, type=consent_type)
                    if _bool_value(item.get("granted")):
                        consent.grant(item.get("policy_version", "") or "")
                    else:
                        consent.revoke()
                results.append({
                    "index": index, "type": consent_type, "success": True,
                    "consent": _consent_payload(consent),
                })
            except ValidationError as exc:
                results.append({
                    "index": index, "type": consent_type, "success": False,
                    "error": "; ".join(exc.messages),
                })

        if data.get("items") is None:
            result = results[0]
            if not result["success"]:
                raise ValidationError(result["error"])
            return JsonResponse(result["consent"])
        succeeded = sum(1 for result in results if result["success"])
        payload = {
            "results": results,
            "summary": {
                "total": len(results),
                "succeeded": succeeded,
                "failed": len(results) - succeeded,
            },
        }
        return JsonResponse(payload, status=200 if succeeded == len(results) else 207)

    existing = {consent.type: consent for consent in account.consents.all()}
    labels = dict(ConsentType.choices)
    return JsonResponse({"consents": [
        _consent_payload(existing[consent_type]) if consent_type in existing else {
            "id": None,
            "type": consent_type,
            "type_label": labels[consent_type],
            "granted": False,
            "is_active": False,
            "granted_at": None,
            "revoked_at": None,
            "policy_version": "",
        }
        for consent_type in ConsentType.values
    ]})


@require_GET
def client_overview(request):
    account = _client_account_from_request(request)
    students = list(_student_queryset_for_client(account))
    today = timezone.localdate()
    payload = []
    type_colors = session_type_color_keys()
    for student in students:
        subscriptions = list(student.subscriptions.select_related("subscription_type").exclude(
            status=SubscriptionStatus.CANCELLED).order_by("-start_date", "-id"))
        next_session = _visible_client_sessions([student], date_from=today).first()
        latest_payment = student.payments.order_by("-paid_at", "-id").first()
        balance = student_balance(student)
        payload.append({
            **_client_student_payload(student),
            "balance": balance.format(),
            "balance_minor": balance.amount_minor,
            "current_subscription": _subscription_payload(subscriptions[0]) if subscriptions else None,
            "next_session": _role_session_payload(
                next_session,
                participant=student,
                type_color_keys=type_colors,
            ) if next_session else None,
            "last_payment": {
                "id": latest_payment.id,
                "amount": latest_payment.amount.format(),
                "status": latest_payment.status,
                "paid_at": latest_payment.paid_at.isoformat(),
            } if latest_payment else None,
        })
    return JsonResponse({
        "account": _client_safe_account_payload(account),
        "participants": payload,
        "students": payload,
    })


@require_GET
def client_schedule(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    date_from = _parse_date(request.GET.get("date_from"), "date_from") or timezone.localdate()
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    type_colors = session_type_color_keys()
    return JsonResponse({
        **_participant_context(account, student),
        "sessions": [
            _role_session_payload(
                session,
                participant=student,
                type_color_keys=type_colors,
            )
            for session in _visible_client_sessions([student], date_from, date_to)
        ],
    })


@require_GET
def client_attendance(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    qs = AttendanceRecord.objects.filter(student=student).select_related(
        "student", "session", "session__group", "session__trainer__user")
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(session__start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(session__start_at__date__lte=date_to)
    status = choice_param(request, "status", set(AttendanceStatus.values))
    if status:
        qs = qs.filter(status=status)
    q = search_param(request)
    if q:
        qs = qs.filter(
            Q(session__group__name__icontains=q) |
            Q(session__location__icontains=q) |
            Q(session__trainer__user__first_name__icontains=q) |
            Q(session__trainer__user__last_name__icontains=q)
        )
    qs = ordered_rows(request, qs, allowlist={
        "-date": ("-session__start_at", "-id"),
        "date": ("session__start_at", "id"),
        "status": ("status", "-session__start_at", "-id"),
        "-status": ("-status", "-session__start_at", "-id"),
    }, default="-date")
    type_colors = session_type_color_keys()
    context = _participant_context(account, student)

    def serialize(record):
        return {
            "id": record.id,
            "student": _client_student_payload(record.student),
            "session": _role_session_payload(
                record.session,
                participant=student,
                type_color_keys=type_colors,
            ),
            "status": record.status,
            "deducts": record.deducts,
            "marked_at": timezone.localtime(record.marked_at).isoformat(),
            "comment": record.comment,
        }

    if list_contract_requested(
            request,
            extra_params={"status", "date_from", "date_to"}):
        return JsonResponse(paginated_payload(
            request,
            qs,
            key="attendance",
            serializer=serialize,
            extra=context,
        ))
    return JsonResponse({
        **context,
        "attendance": [serialize(record) for record in qs],
    })


def _client_charge_payload(charge, allocation=None):
    reversal = getattr(charge, "reversal", None)
    is_reversed = bool(reversal) or bool(allocation and allocation.is_reversed)
    outstanding_minor = (
        0 if is_reversed
        else max(0, charge.amount_minor - (allocation.paid_minor if allocation else 0))
    )
    if is_reversed:
        status = "reversed"
    elif outstanding_minor == 0:
        status = "paid"
    elif allocation and allocation.is_overdue:
        status = "overdue"
    else:
        status = "upcoming"
    return {
        "id": charge.id,
        "student_id": charge.student_id,
        "student": charge.student.full_name,
        "description": charge.description,
        "amount": charge.amount.format(),
        "amount_minor": charge.amount_minor,
        "paid_minor": charge.amount_minor - outstanding_minor,
        "outstanding_minor": outstanding_minor,
        "status": status,
        "currency": charge.currency,
        "due_date": charge.due_date.isoformat(),
        "reference_id": charge.reference_id or None,
        "reversal": _charge_payload(charge)["reversal"],
    }


def _client_payment_history_payload(payment):
    return {
        **_payment_payload(payment),
        "student_id": payment.student_id,
        "student": payment.student.full_name,
    }


@require_GET
def client_payments(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    charges = Charge.objects.filter(student=student).select_related(
        "student", "created_by", "reversal", "reversal__created_by"
    ).order_by("-due_date", "-id")
    payments = Payment.objects.filter(student=student).select_related(
        "student", "student__parent__user", "confirmed_by").prefetch_related(
        "receipts", "events", "events__actor").order_by("-paid_at", "-id")
    return JsonResponse({
        **_participant_context(account, student),
        "charges": [_client_charge_payload(charge) for charge in charges],
        "payments": [
            _client_payment_history_payload(payment) for payment in payments
        ],
    })


@require_GET
def client_charges(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    qs = Charge.objects.filter(student=student).select_related(
        "student", "created_by", "reversal", "reversal__created_by")
    allocations = {row.charge.id: row for row in charge_statuses(student)}
    unpaid = [row for row in allocations.values() if row.paid_minor < row.charge.amount_minor]
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(due_date__gte=date_from)
    if date_to:
        qs = qs.filter(due_date__lte=date_to)
    status = choice_param(request, "status", {"overdue", "upcoming"})
    if status == "overdue":
        qs = qs.filter(pk__in=[row.charge.id for row in unpaid if row.is_overdue])
    elif status == "upcoming":
        qs = qs.filter(pk__in=[row.charge.id for row in unpaid if not row.is_overdue])
    q = search_param(request)
    if q:
        qs = qs.filter(description__icontains=q)
    qs = ordered_rows(request, qs, allowlist={
        "-date": ("-due_date", "-id"),
        "date": ("due_date", "id"),
        "-amount": ("-amount_minor", "-id"),
        "amount": ("amount_minor", "id"),
    }, default="date")
    return JsonResponse(paginated_payload(
        request,
        qs,
        key="charges",
        serializer=lambda charge: _client_charge_payload(charge, allocations.get(charge.id)),
        extra={
            **_participant_context(account, student),
            "summary": {
                "unpaid_minor": sum(row.charge.amount_minor - row.paid_minor for row in unpaid),
                "overdue_count": sum(1 for row in unpaid if row.is_overdue),
                "currency": settings.DEFAULT_CURRENCY,
            },
        },
    ))


@require_GET
def client_payment_history(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    qs = Payment.objects.filter(student=student).select_related(
        "student", "student__parent__user", "confirmed_by").prefetch_related(
        "receipts", "events", "events__actor")
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(paid_at__gte=date_from)
    if date_to:
        qs = qs.filter(paid_at__lte=date_to)
    status = choice_param(request, "status", set(PaymentStatus.values))
    if status:
        qs = qs.filter(status=status)
    method = choice_param(request, "method", set(PaymentMethod.values))
    if method:
        qs = qs.filter(method=method)
    source = choice_param(request, "source", set(PaymentSource.values))
    if source:
        qs = qs.filter(source=source)
    q = search_param(request)
    if q:
        qs = qs.filter(comment__icontains=q)
    qs = ordered_rows(request, qs, allowlist={
        "-date": ("-paid_at", "-id"),
        "date": ("paid_at", "id"),
        "-amount": ("-amount_minor", "-id"),
        "amount": ("amount_minor", "id"),
        "status": ("status", "-paid_at", "-id"),
        "-status": ("-status", "-paid_at", "-id"),
    }, default="-date")
    return JsonResponse(paginated_payload(
        request,
        qs,
        key="payments",
        serializer=_client_payment_history_payload,
        extra=_participant_context(account, student),
    ))


@require_GET
def client_notifications(request):
    account = _client_account_from_request(request)
    rows = NotificationLog.objects.filter(recipient=account).order_by("-created_at", "-id")

    def serialize(log):
        return {
            "id": log.id,
            "event_type": log.event_type,
            "channel": log.channel,
            "status": log.status,
            "language_code": log.language_code,
            "subject": log.subject,
            "body": log.body,
            "scheduled_at": log.scheduled_at.isoformat(),
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
            "delivered_at": log.delivered_at.isoformat() if log.delivered_at else None,
        }

    return JsonResponse(paginated_payload(
        request, rows, key="notifications", serializer=serialize))


@require_POST
def client_create_top_up_request(request):
    account = _client_account_from_request(request)
    student_id = request.POST.get("student_id")
    student = _student_owned_by_client(account, student_id) if student_id else _default_billing_student_for_client(account)
    _require_active_participant(
        student, "request a balance top-up", field="student_id")
    file = request.FILES.get("file")
    if file is None:
        raise _field_validation_error(
            "file", "Приложите подтверждение банковского перевода.",
            code="required")
    payment, receipt, created = create_client_top_up_request(
        student=student,
        account=account,
        actor=request.user,
        amount_minor=request.POST.get("amount_minor"),
        currency=request.POST.get("currency", settings.DEFAULT_CURRENCY),
        paid_at=_parse_date(request.POST.get("paid_at"), "paid_at") or timezone.localdate(),
        file=file,
        idempotency_key=request.POST.get("idempotency_key"),
        comment=request.POST.get("comment", ""),
    )
    payment = Payment.objects.select_related(
        "student", "student__parent__user", "confirmed_by"
    ).prefetch_related("receipts", "events", "events__actor").get(pk=payment.pk)
    payload = _payment_payload(payment)
    balance = student_balance(student)
    payload.update({
        "balance_minor": balance.amount_minor,
        "balance_currency": balance.currency,
        "audit_event": payload["events"][-1] if payload["events"] else None,
        "idempotent_replay": not created,
    })
    return JsonResponse({
        "top_up_request": payload,
        "payment": payload,
        "receipt": {"id": receipt.id, "original_name": receipt.original_name},
    }, status=201 if created else 200)


@require_POST
def client_upload_receipt(request):
    """Legacy alias: canonical clients must use the idempotent top-up route."""
    if not request.POST.get("idempotency_key"):
        request.POST._mutable = True
        request.POST["idempotency_key"] = f"legacy-{request.user.pk}-{timezone.now().timestamp()}"
        request.POST._mutable = False
    return client_create_top_up_request(request)


@require_GET
def download_receipt(request, document_id):
    receipt = get_object_or_404(
        ReceiptFile.objects.select_related("payment__student__parent"),
        pk=document_id, is_deleted=False)
    if not receipt.file:
        return _error("Document is no longer available", status=404)
    owns_document = (
        request.user.is_authenticated
        and request.user.role == Role.PARENT
        and receipt.payment.student.parent.user_id == request.user.id
    )
    is_admin = request.user.is_authenticated and request.user.role == Role.ADMIN
    if not (owns_document or is_admin):
        raise PermissionDenied("Document access denied")
    return FileResponse(
        receipt.file.open("rb"),
        as_attachment=True,
        filename=receipt.original_name or receipt.file.name.rsplit("/", 1)[-1])


