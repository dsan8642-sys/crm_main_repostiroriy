from .support import *
from .admin_support import _admin_required
from audit.models import AuditLogEntry


def _session_attendance_payload(session):
    attendance = {record.student_id: record for record in session.attendance.select_related("student")}
    one_off_participants = {
        participant.student_id: participant
        for participant in session.participants.filter(
            status=SessionParticipantStatus.ACTIVE,
        ).select_related("student")
    }
    history = AuditLogEntry.objects.filter(entity_type="Session", entity_id=str(session.id)).select_related("actor")[:50]
    return {
        "session": _session_payload(session),
        "history": [{
            "id": entry.id,
            "action": entry.action,
            "actor": str(entry.actor) if entry.actor_id else "Система",
            "changes": entry.changes,
            "created_at": timezone.localtime(entry.created_at).isoformat(),
        } for entry in history],
        "students": [{
            **_student_payload(student),
            "attendance": _attendance_payload(attendance[student.id]) if student.id in attendance else None,
            "session_participant": {
                "id": one_off_participants[student.id].id,
                "source": one_off_participants[student.id].source,
                "status": one_off_participants[student.id].status,
                "note": one_off_participants[student.id].note,
            } if student.id in one_off_participants else None,
            "can_remove_from_session": student.id in one_off_participants,
        } for student in _session_roster(session)],
    }

@require_http_methods(["GET", "POST"])
def admin_schedule_templates(request):
    user = _admin_required(request)
    if request.method == "POST":
        template = RecurringTemplate()
        _apply_template_data(template, _json_body(request))
        audit(user, "template.created", template, {"source": "api"})
        return JsonResponse(_template_payload(template), status=201)
    qs = RecurringTemplate.objects.select_related("group", "trainer__user").order_by("weekday", "start_time", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    if request.GET.get("trainer_id"):
        qs = qs.filter(trainer_id=request.GET["trainer_id"])
    return JsonResponse({"templates": [_template_payload(template) for template in qs[:200]]})


@require_http_methods(["GET", "POST"])
def admin_schedule_template_detail(request, template_id):
    user = _admin_required(request)
    template = get_object_or_404(
        RecurringTemplate.objects.select_related("group", "trainer__user"), pk=template_id)
    if request.method == "POST":
        _apply_template_data(template, _json_body(request))
        audit(user, "template.updated", template, {"source": "api"})
        return JsonResponse(_template_payload(template))
    return JsonResponse(_template_payload(template))


@require_POST
def admin_schedule_template_generate(request, template_id):
    user = _admin_required(request)
    template = get_object_or_404(RecurringTemplate.objects.select_related("group", "trainer__user"), pk=template_id)
    data = _json_body(request)
    created, skipped = generate_sessions(
        template,
        _parse_date(data.get("date_from"), "date_from"),
        _parse_date(data.get("date_to"), "date_to"),
        skip_conflicts=_bool_value(data.get("skip_conflicts")),
        actor=user,
    )
    return JsonResponse({
        "created": [_session_payload(session) for session in created],
        "created_count": len(created),
        "skipped": [day.isoformat() for day in skipped],
        "skipped_count": len(skipped),
    }, status=201)


@require_POST
def admin_schedule_template_cancel_future(request, template_id):
    user = _admin_required(request)
    template = get_object_or_404(RecurringTemplate, pk=template_id)
    data = _json_body(request)
    count = cancel_series(
        template,
        date_from=_parse_date(data.get("date_from"), "date_from") or timezone.localdate(),
        actor=user,
    )
    return JsonResponse({"cancelled": count})


@require_http_methods(["GET", "POST"])
def admin_schedule_sessions(request):
    user = _admin_required(request)
    if request.method == "POST":
        session = _create_session_from_data(_json_body(request), actor=user)
        return JsonResponse(_session_payload(session), status=201)
    qs = Session.objects.select_related(
        "group", "trainer__user", "substitute_trainer__user", "individual_student", "template"
    ).order_by("start_at", "id")
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    if request.GET.get("trainer_id"):
        qs = qs.filter(trainer_id=request.GET["trainer_id"])
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    if request.GET.get("cancelled") in {"true", "false"}:
        qs = qs.filter(is_cancelled=request.GET["cancelled"] == "true")
    return JsonResponse({"sessions": [_session_payload(session) for session in qs[:MAX_LIST_ROWS]]})


@require_http_methods(["GET", "POST", "DELETE"])
def admin_schedule_session_detail(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student", "template"
        ), pk=session_id)
    if request.method == "DELETE":
        deleted_id = delete_session(session, actor=user)
        return JsonResponse({"deleted": True, "session_id": deleted_id})
    if request.method == "POST":
        changes = _session_changes_from_data(_json_body(request))
        edit_single_session(session, actor=user, **changes)
        return JsonResponse(_session_payload(session))
    return JsonResponse(_session_payload(session))


@require_http_methods(["GET", "POST"])
def admin_schedule_session_attendance(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student"
        ), pk=session_id)
    if request.method == "POST":
        data = _json_body(request)
        try:
            student_id = int(data.get("student_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError("student_id is required") from exc
        status = data.get("status")
        if status not in AttendanceStatus.values:
            raise ValidationError("invalid attendance status")
        allowed_student_ids = set(_session_roster(session).values_list("id", flat=True))
        if student_id not in allowed_student_ids:
            raise PermissionDenied("student is not in this session roster")
        record = set_attendance(session_id=session.id, student=Student.objects.get(pk=student_id),
                                status=status, actor=user)
        return JsonResponse(_attendance_payload(record))

    return JsonResponse(_session_attendance_payload(session))


@require_POST
def admin_schedule_session_participants(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student"
        ),
        pk=session_id,
    )
    data = _json_body(request)
    if session.is_cancelled:
        raise ValidationError("cancelled sessions cannot receive participants")
    try:
        student_id = int(data.get("student_id"))
    except (TypeError, ValueError) as exc:
        raise ValidationError("student_id is required") from exc
    student = get_object_or_404(Student.objects.select_related("parent__user", "group"), pk=student_id)
    _require_active_participant(student, "be added to sessions")

    existing_active_ids = set(_session_roster(session).values_list("id", flat=True))
    participant = SessionParticipant.objects.filter(session=session, student=student).first()
    if student.id in existing_active_ids and not participant:
        raise ValidationError("student is already in this session roster")
    if student.id not in existing_active_ids and len(existing_active_ids) >= session.max_participants:
        raise ValidationError(f"session capacity is full ({session.max_participants})")

    created = participant is None
    if created:
        participant = SessionParticipant(session=session, student=student)
    participant.source = SessionParticipantSource.MANUAL
    participant.status = SessionParticipantStatus.ACTIVE
    participant.note = data.get("note", "") or ""
    participant.full_clean()
    participant.save()
    audit(user, "session_participant.added", participant, {
        "session_id": session.id,
        "student_id": student.id,
        "created": created,
    })
    return JsonResponse(_session_attendance_payload(session), status=201 if created else 200)


@require_http_methods(["DELETE"])
def admin_schedule_session_participant_detail(request, session_id, student_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student"
        ),
        pk=session_id,
    )
    participant = SessionParticipant.objects.filter(
        session=session,
        student_id=student_id,
        status=SessionParticipantStatus.ACTIVE,
    ).first()
    if not participant:
        raise ValidationError("base group/individual participant cannot be removed from this session here")
    participant.status = SessionParticipantStatus.CANCELLED
    participant.full_clean()
    participant.save(update_fields=["status", "updated_at"])
    audit(user, "session_participant.cancelled", participant, {
        "session_id": session.id,
        "student_id": student_id,
    })
    return JsonResponse(_session_attendance_payload(session))


@require_http_methods(["GET", "POST"])
def admin_schedule_session_waitlist(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(Session, pk=session_id)
    if request.method == "POST":
        data = _json_body(request)
        try:
            student_id = int(data.get("student_id"))
        except (TypeError, ValueError) as exc:
            raise ValidationError("student_id is required") from exc
        if WaitlistEntry.objects.filter(session=session, student_id=student_id).exists():
            raise ValidationError("student is already on this session waitlist")
        entry = WaitlistEntry(session=session)
        _apply_waitlist_data(entry, data)
        audit(user, "waitlist.created", entry, {
            "session_id": session.id,
            "student_id": entry.student_id,
            "status": entry.status,
        })
        return JsonResponse(_waitlist_payload(entry), status=201)
    qs = session.waitlist_entries.select_related("student", "student__parent", "student__group")
    if request.GET.get("status"):
        qs = qs.filter(status=request.GET["status"])
    return JsonResponse({
        "waitlist": [_waitlist_payload(entry) for entry in qs.order_by("priority", "created_at", "id")[:200]],
    })


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_schedule_waitlist_entry_detail(request, entry_id):
    user = _admin_required(request)
    entry = get_object_or_404(
        WaitlistEntry.objects.select_related("session", "student", "student__parent", "student__group"),
        pk=entry_id,
    )
    if request.method == "GET":
        return JsonResponse(_waitlist_payload(entry))
    before = {"priority": entry.priority, "status": entry.status, "note": entry.note}
    if request.method == "DELETE":
        if entry.status == WaitlistStatus.PROMOTED:
            raise ValidationError("promoted waitlist entries cannot be cancelled")
        _apply_waitlist_data(entry, {"status": WaitlistStatus.CANCELLED})
    else:
        data = _json_body(request)
        if entry.status == WaitlistStatus.PROMOTED and data.get("status") not in (None, WaitlistStatus.PROMOTED):
            raise ValidationError("promoted waitlist entries cannot change status")
        _apply_waitlist_data(entry, data)
    audit(user, "waitlist.updated", entry, {
        "before": before,
        "after": {"priority": entry.priority, "status": entry.status, "note": entry.note},
    })
    return JsonResponse(_waitlist_payload(entry))


@require_POST
def admin_schedule_waitlist_entry_promote(request, entry_id):
    user = _admin_required(request)
    entry = get_object_or_404(
        WaitlistEntry.objects.select_related("session", "student", "student__parent", "student__group"),
        pk=entry_id,
    )
    entry, participant = promote_waitlist_entry(entry, actor=user)
    entry.participant_id = participant.id
    return JsonResponse(_waitlist_payload(entry))


@require_POST
def admin_schedule_session_cancel(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(Session, pk=session_id)
    data = _json_body(request) if request.content_type == "application/json" else {}
    reason = str(data.get("reason") or "").strip()
    notes = session.notes
    if reason:
        notes = f"{notes}\nПричина отмены: {reason}".strip()
    session = edit_single_session(session, actor=user, is_cancelled=True, notes=notes)
    return JsonResponse(_session_payload(session))


@require_POST
def admin_schedule_check_conflict(request):
    _admin_required(request)
    data = _json_body(request)
    trainer = get_object_or_404(Trainer, pk=data.get("trainer_id"))
    try:
        check_trainer_conflict(
            trainer,
            _parse_datetime(data.get("start_at"), "start_at"),
            _parse_datetime(data.get("end_at"), "end_at"),
            exclude_session_id=data.get("exclude_session_id"),
        )
    except ScheduleConflict as exc:
        return JsonResponse({"has_conflict": True, "error": exc.messages if hasattr(exc, "messages") else str(exc)})
    return JsonResponse({"has_conflict": False})


