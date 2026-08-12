from .support import *
from .pagination import paginated_payload


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
    type_colors = session_type_color_keys()
    return JsonResponse({
        **_participant_context(account, student),
        "attendance": [{
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
    } for record in qs.order_by("-session__start_at", "-id")]})


@require_GET
def client_payments(request):
    account = _client_account_from_request(request)
    student = _participant_for_client_request(request, account)
    charges = Charge.objects.filter(student=student).select_related("student").order_by("-due_date", "-id")
    payments = Payment.objects.filter(student=student).select_related(
        "student", "confirmed_by").prefetch_related(
        "receipts", "events", "events__actor").order_by("-paid_at", "-id")
    return JsonResponse({
        **_participant_context(account, student),
        "charges": [{
            "id": charge.id,
            "student_id": charge.student_id,
            "student": charge.student.full_name,
            "description": charge.description,
            "amount": charge.amount.format(),
            "amount_minor": charge.amount_minor,
            "currency": charge.currency,
            "due_date": charge.due_date.isoformat(),
        } for charge in charges],
        "payments": [{
            **_payment_payload(payment),
            "student_id": payment.student_id,
            "student": payment.student.full_name,
        } for payment in payments],
    })


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
    file = request.FILES.get("file")
    if file is None:
        raise _field_validation_error(
            "file", "Приложите подтверждение банковского перевода.",
            code="required")
    payment, receipt = create_client_top_up_request(
        student=student,
        account=account,
        actor=request.user,
        amount_minor=request.POST.get("amount_minor"),
        currency=request.POST.get("currency", settings.DEFAULT_CURRENCY),
        paid_at=_parse_date(request.POST.get("paid_at"), "paid_at") or timezone.localdate(),
        file=file,
        comment=request.POST.get("comment", ""),
    )
    payload = _payment_payload(payment)
    return JsonResponse({
        "top_up_request": payload,
        "payment": payload,
        "receipt": {"id": receipt.id, "original_name": receipt.original_name},
    }, status=201)


# Compatibility route for already deployed clients. It uses the same safe
# pending-request workflow and can never create a confirmed payment.
client_upload_receipt = client_create_top_up_request


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


