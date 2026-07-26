from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload
from audit.models import AuditLogEntry
from scheduling.models import WeeklyPlan, WeeklyPlanSlot
from scheduling.services import (
    commit_copy_period,
    generate_weekly_plan,
    preview_copy_period,
)


def _weekly_plan_slot_payload(slot):
    return {
        "id": slot.id,
        "trainer_id": slot.trainer_id,
        "trainer": str(slot.trainer),
        "weekday": slot.weekday,
        "weekday_label": slot.get_weekday_display(),
        "start_time": slot.start_time.isoformat(timespec="minutes"),
        "duration_minutes": slot.duration_minutes,
        "location": slot.location,
        "max_participants": slot.max_participants,
        "is_active": slot.is_active,
    }


def _weekly_plan_payload(plan):
    return {
        "id": plan.id,
        "name": plan.name,
        "group": {"id": plan.group_id, "name": plan.group.name},
        "is_active": plan.is_active,
        "slots": [_weekly_plan_slot_payload(slot) for slot in plan.slots.all()],
    }


def _apply_weekly_plan(plan, data):
    if "group_id" in data:
        plan.group = get_object_or_404(Group, pk=data.get("group_id"))
    if "name" in data:
        plan.name = data.get("name", "") or ""
    if "is_active" in data:
        plan.is_active = _bool_value(data.get("is_active"), True)
    plan.full_clean()
    plan.save()
    return plan


def _apply_weekly_plan_slot(slot, data):
    if "trainer_id" in data:
        slot.trainer = get_object_or_404(Trainer, pk=data.get("trainer_id"))
    if "weekday" in data:
        slot.weekday = int(data.get("weekday"))
    if "start_time" in data:
        slot.start_time = _parse_time(data.get("start_time"), "start_time")
    if "duration_minutes" in data:
        slot.duration_minutes = int(data.get("duration_minutes"))
    if "location" in data:
        slot.location = data.get("location", "") or ""
    if "max_participants" in data:
        slot.max_participants = int(data.get("max_participants"))
    if "is_active" in data:
        slot.is_active = _bool_value(data.get("is_active"), True)
    slot.full_clean()
    slot.save()
    return slot


@require_http_methods(["GET", "POST"])
def admin_schedule_weekly_plans(request):
    user = _admin_required(request)
    if request.method == "POST":
        with transaction.atomic():
            plan = _apply_weekly_plan(WeeklyPlan(), _json_body(request))
            audit(user, "weekly_plan.created", plan, {"source": "api"})
        return JsonResponse(_weekly_plan_payload(plan), status=201)
    qs = WeeklyPlan.objects.select_related("group").prefetch_related(
        "slots__trainer__user").order_by("group__name", "name", "id")
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=request.GET["group_id"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="plans", serializer=_weekly_plan_payload))


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def admin_schedule_weekly_plan_detail(request, plan_id):
    user = _admin_required(request)
    plan = get_object_or_404(
        WeeklyPlan.objects.select_related("group").prefetch_related(
            "slots__trainer__user"),
        pk=plan_id,
    )
    if request.method in {"POST", "PATCH"}:
        _apply_weekly_plan(plan, _json_body(request))
        audit(user, "weekly_plan.updated", plan, {"source": "api"})
    elif request.method == "DELETE":
        plan.is_active = False
        plan.save(update_fields=["is_active"])
        audit(user, "weekly_plan.archived", plan, {"source": "api"})
    return JsonResponse(_weekly_plan_payload(plan))


@require_POST
def admin_schedule_weekly_plan_slots(request, plan_id):
    user = _admin_required(request)
    plan = get_object_or_404(WeeklyPlan, pk=plan_id)
    slot = _apply_weekly_plan_slot(WeeklyPlanSlot(plan=plan), _json_body(request))
    audit(user, "weekly_plan_slot.created", slot, {"plan_id": plan.id})
    plan = WeeklyPlan.objects.select_related("group").prefetch_related(
        "slots__trainer__user").get(pk=plan.id)
    return JsonResponse(_weekly_plan_payload(plan), status=201)


@require_http_methods(["PATCH", "DELETE"])
def admin_schedule_weekly_plan_slot_detail(request, slot_id):
    user = _admin_required(request)
    slot = get_object_or_404(WeeklyPlanSlot.objects.select_related("plan"), pk=slot_id)
    if request.method == "PATCH":
        _apply_weekly_plan_slot(slot, _json_body(request))
        audit(user, "weekly_plan_slot.updated", slot, {"plan_id": slot.plan_id})
    else:
        slot.is_active = False
        slot.save(update_fields=["is_active"])
        audit(user, "weekly_plan_slot.archived", slot, {"plan_id": slot.plan_id})
    return JsonResponse(_weekly_plan_slot_payload(slot))


@require_POST
def admin_schedule_weekly_plan_generate(request, plan_id):
    user = _admin_required(request)
    plan = get_object_or_404(
        WeeklyPlan.objects.select_related("group").prefetch_related("slots"), pk=plan_id)
    data = _json_body(request)
    created, skipped = generate_weekly_plan(
        plan,
        _parse_date(data.get("date_from"), "date_from"),
        _parse_date(data.get("date_to"), "date_to"),
        skip_conflicts=_bool_value(data.get("skip_conflicts")),
        actor=user,
    )
    return JsonResponse({
        "created": [_session_payload(session) for session in created],
        "created_count": len(created),
        "skipped": skipped,
        "skipped_count": len(skipped),
    }, status=201)


@require_POST
def admin_schedule_copy_preview(request):
    user = _admin_required(request)
    data = _json_body(request)
    batch, rows = preview_copy_period(
        actor=user,
        source_from=_parse_date(data.get("source_from"), "source_from"),
        source_to=_parse_date(data.get("source_to"), "source_to"),
        target_from=_parse_date(data.get("target_from"), "target_from"),
        target_to=_parse_date(data.get("target_to"), "target_to"),
        include_group=_bool_value(data.get("include_group"), True),
        include_individual=_bool_value(data.get("include_individual"), True),
        include_split=_bool_value(data.get("include_split"), True),
    )
    return JsonResponse({
        "batch_id": batch.id,
        "expires_at": timezone.localtime(batch.expires_at).isoformat(),
        "rows": rows,
    })


@require_POST
def admin_schedule_copy_commit(request):
    user = _admin_required(request)
    data = _json_body(request)
    selected_indices = data.get("selected_indices")
    if not isinstance(selected_indices, list):
        raise ValidationError("selected_indices must be a list")
    batch, created, skipped = commit_copy_period(
        batch_id=data.get("batch_id"),
        actor=user,
        selected_indices=selected_indices,
    )
    return JsonResponse({
        "batch_id": batch.id,
        "created_count": len(created),
        "skipped": skipped,
        "skipped_count": len(skipped),
    }, status=201)


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
    return JsonResponse(paginated_payload(
        request, qs, key="templates", serializer=_template_payload))


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
    return JsonResponse(paginated_payload(
        request, qs, key="sessions", serializer=_session_payload))


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def admin_schedule_session_detail(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student", "template"
        ), pk=session_id)
    if request.method == "DELETE":
        data = _json_body(request)
        if data.get("force") is not True or str(data.get("confirm_session_id")) != str(session.id):
            raise ValidationError("Подтвердите удаление точным ID занятия")
        deleted_id = delete_session(session, actor=user, force=True)
        return JsonResponse({"deleted": True, "session_id": deleted_id})
    if request.method in {"POST", "PATCH"}:
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
        start_at = _parse_datetime(data.get("start_at"), "start_at")
        if data.get("end_at"):
            end_at = _parse_datetime(data.get("end_at"), "end_at")
        else:
            try:
                duration_minutes = int(data.get("duration_minutes"))
            except (TypeError, ValueError) as exc:
                raise ValidationError("duration_minutes must be an integer") from exc
            end_at = start_at + timedelta(minutes=duration_minutes)
        check_trainer_conflict(
            trainer,
            start_at,
            end_at,
            exclude_session_id=data.get("exclude_session_id"),
        )
    except ScheduleConflict as exc:
        return JsonResponse({"has_conflict": True, "error": exc.messages if hasattr(exc, "messages") else str(exc)})
    return JsonResponse({"has_conflict": False})


