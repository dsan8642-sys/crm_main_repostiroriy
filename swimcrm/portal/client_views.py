from .support import *

@require_http_methods(["GET", "POST"])
def client_profile(request):
    account = _client_account_from_request(request)
    if request.method == "POST":
        data = _json_body(request)
        with transaction.atomic():
            if _account_data(data):
                _apply_account_data(account, data)
            participant_data = _participant_data(data)
            if participant_data:
                participant_id = participant_data.get("id") or data.get("participant_id")
                participant = _student_owned_by_client(account, participant_id)
                _apply_participant_data(participant, {"participant": participant_data})
        return JsonResponse(_client_detail_payload(account))
    return JsonResponse(_client_detail_payload(account))


@require_http_methods(["GET", "POST"])
def client_consents(request):
    account = _client_account_from_request(request)
    if request.method == "POST":
        data = _json_body(request)
        consent_type = data.get("type")
        if consent_type not in ConsentType.values:
            raise ValidationError("invalid consent type")
        consent, _ = Consent.objects.get_or_create(parent=account, type=consent_type)
        if _bool_value(data.get("granted")):
            consent.grant(data.get("policy_version", "") or "")
        else:
            consent.revoke()
        return JsonResponse(_consent_payload(consent))

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
    for student in students:
        subscriptions = list(student.subscriptions.select_related("subscription_type").exclude(
            status=SubscriptionStatus.CANCELLED).order_by("-start_date", "-id"))
        next_session = _visible_client_sessions([student], date_from=today).first()
        latest_payment = student.payments.order_by("-paid_at", "-id").first()
        balance = student_balance(student)
        payload.append({
            **_student_payload(student),
            "balance": balance.format(),
            "balance_minor": balance.amount_minor,
            "current_subscription": _subscription_payload(subscriptions[0]) if subscriptions else None,
            "next_session": _session_payload(next_session) if next_session else None,
            "last_payment": {
                "id": latest_payment.id,
                "amount": latest_payment.amount.format(),
                "status": latest_payment.status,
                "paid_at": latest_payment.paid_at.isoformat(),
            } if latest_payment else None,
        })
    return JsonResponse({
        "account": _client_account_payload(account),
        "participants": payload,
        "students": payload,
    })


@require_GET
def client_schedule(request):
    account = _client_account_from_request(request)
    date_from = _parse_date(request.GET.get("date_from"), "date_from") or timezone.localdate()
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    students = list(_student_queryset_for_client(account))
    return JsonResponse({
        "sessions": [_session_payload(session) for session in _visible_client_sessions(students, date_from, date_to)]
    })


@require_GET
def client_attendance(request):
    account = _client_account_from_request(request)
    qs = AttendanceRecord.objects.filter(student__parent=account).select_related(
        "student", "session", "session__group", "session__trainer__user")
    student_id = request.GET.get("student_id")
    if student_id:
        _student_owned_by_client(account, student_id)
        qs = qs.filter(student_id=student_id)
    return JsonResponse({"attendance": [{
        "id": record.id,
        "student": _student_payload(record.student),
        "session": _session_payload(record.session),
        "status": record.status,
        "deducts": record.deducts,
        "marked_at": timezone.localtime(record.marked_at).isoformat(),
        "comment": record.comment,
    } for record in qs.order_by("-session__start_at", "-id")]})


@require_GET
def client_payments(request):
    account = _client_account_from_request(request)
    students = list(_student_queryset_for_client(account))
    student_ids = [s.id for s in students]
    charges = Charge.objects.filter(student_id__in=student_ids).select_related("student").order_by("-due_date", "-id")
    payments = Payment.objects.filter(student_id__in=student_ids).select_related("student").order_by("-paid_at", "-id")
    return JsonResponse({
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
            "id": payment.id,
            "student_id": payment.student_id,
            "student": payment.student.full_name,
            "amount": payment.amount.format(),
            "amount_minor": payment.amount_minor,
            "currency": payment.currency,
            "paid_at": payment.paid_at.isoformat(),
            "method": payment.method,
            "status": payment.status,
            "comment": payment.comment,
        } for payment in payments],
    })


@require_POST
def client_upload_receipt(request):
    account = _client_account_from_request(request)
    student_id = request.POST.get("student_id")
    student = _student_owned_by_client(account, student_id) if student_id else _default_billing_student_for_client(account)
    file = request.FILES.get("file")
    if file is None:
        raise ValidationError("РќСѓР¶РЅРѕ РїСЂРёР»РѕР¶РёС‚СЊ С„Р°Р№Р» С‡РµРєР°")
    payment = Payment.objects.create(
        student=student,
        amount_minor=int(request.POST["amount_minor"]),
        currency=request.POST.get("currency", "PLN"),
        paid_at=_parse_date(request.POST.get("paid_at"), "paid_at") or timezone.localdate(),
        method=normalize_payment_method(request.POST.get("method", PaymentMethod.TRANSFER)),
        comment=request.POST.get("comment", ""),
        created_by=request.user,
    )
    receipt = ReceiptFile(
        payment=payment, uploaded_by=account, file=file,
        original_name=getattr(file, "name", ""))
    receipt.full_clean(exclude=["payment", "uploaded_by"])
    receipt.save()
    return JsonResponse({
        "payment": {"id": payment.id, "status": payment.status, "amount": payment.amount.format()},
        "receipt": {"id": receipt.id, "original_name": receipt.original_name},
    }, status=201)


