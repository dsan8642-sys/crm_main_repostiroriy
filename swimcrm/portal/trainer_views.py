from .support import *

@require_GET
def trainer_sessions(request):
    trainer = _trainer_from_request(request)
    history = request.GET.get("history") in {"1", "true", "yes"}
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    qs = Session.objects.filter(trainer=trainer).select_related(
        "group", "trainer__user", "individual_student")
    if history:
        qs = qs.filter(start_at__date__lt=timezone.localdate()).order_by("-start_at", "-id")
    else:
        qs = qs.filter(start_at__date__gte=date_from or timezone.localdate()).order_by("start_at", "id")
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    if request.GET.get("status") == "cancelled":
        qs = qs.filter(is_cancelled=True)
    elif request.GET.get("status") == "active":
        qs = qs.filter(is_cancelled=False)
    return JsonResponse({"sessions": [_session_payload(session) for session in qs[:300]]})


@require_GET
def trainer_groups(request):
    trainer = _trainer_from_request(request)
    today = timezone.localdate()
    groups = Group.objects.filter(default_trainer=trainer).order_by("name", "id")
    payload = []
    for group in groups:
        next_session = Session.objects.filter(
            trainer=trainer,
            group=group,
            is_cancelled=False,
            start_at__date__gte=today,
        ).order_by("start_at", "id").first()
        payload.append({
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "students_count": group.students.filter(is_active=True).count(),
            "is_active": group.is_active,
            "next_session": _session_payload(next_session) if next_session else None,
        })
    return JsonResponse({"groups": payload})


@require_GET
def trainer_history(request):
    trainer = _trainer_from_request(request)
    qs = Session.objects.filter(trainer=trainer, start_at__date__lt=timezone.localdate()).select_related(
        "group", "trainer__user", "individual_student").order_by("-start_at", "-id")
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    return JsonResponse({"sessions": [_session_payload(session) for session in qs[:300]]})


@require_GET
def trainer_session_detail(request, session_id):
    trainer = _trainer_from_request(request)
    session = get_object_or_404(Session.objects.select_related("group", "trainer__user"), pk=session_id, trainer=trainer)
    attendance = {record.student_id: record for record in session.attendance.all()}
    return JsonResponse({
        "session": _session_payload(session),
        "students": [{
            **_student_payload(student),
            "attendance": {
                "status": attendance[student.id].status,
                "comment": attendance[student.id].comment,
                "marked_at": timezone.localtime(attendance[student.id].marked_at).isoformat(),
            } if student.id in attendance else None,
        } for student in _session_roster(session)],
    })


@require_POST
def trainer_mark_attendance(request, session_id):
    trainer = _trainer_from_request(request)
    session = get_object_or_404(Session, pk=session_id, trainer=trainer)
    data = _json_body(request)
    try:
        student_id = int(data.get("student_id"))
    except (TypeError, ValueError) as exc:
        raise ValidationError("student_id РѕР±СЏР·Р°С‚РµР»РµРЅ") from exc
    status = data.get("status")
    if status not in AttendanceStatus.values:
        raise ValidationError("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ СЃС‚Р°С‚СѓСЃ РїРѕСЃРµС‰Р°РµРјРѕСЃС‚Рё")
    allowed_student_ids = set(_session_roster(session).values_list("id", flat=True))
    if student_id not in allowed_student_ids:
        raise PermissionDenied("Р­С‚РѕС‚ СѓС‡РµРЅРёРє РЅРµ РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє Р·Р°РЅСЏС‚РёСЋ С‚СЂРµРЅРµСЂР°")
    record = set_attendance(session_id=session.id, student=Student.objects.get(pk=student_id),
                            status=status, actor=request.user)
    return JsonResponse({
        "id": record.id,
        "student_id": record.student_id,
        "session_id": record.session_id,
        "status": record.status,
        "deducts": record.deducts,
    })

