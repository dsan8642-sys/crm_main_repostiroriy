from datetime import timedelta

from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload
from audit.models import AuditLogEntry
from scheduling.services import (
    _duration_minutes,
    commit_copy_period,
    preview_copy_period,
    restore_session,
)


@require_POST
def admin_schedule_copy_preview(request):
    user = _admin_required(request)
    data = _json_body(request)
    dates = {
        field: _parse_date(data.get(field), field)
        for field in ("source_from", "source_to", "target_from", "target_to")
    }
    missing = {
        field: ValidationError("Укажите дату.", code="required")
        for field, value in dates.items() if value is None
    }
    if missing:
        raise ValidationError(missing)
    if dates["source_to"] < dates["source_from"]:
        raise _field_validation_error(
            "source_to", "Конечная дата не может быть раньше начальной.",
            code="invalid_range")
    if dates["target_to"] < dates["target_from"]:
        raise _field_validation_error(
            "target_to", "Конечная дата не может быть раньше начальной.",
            code="invalid_range")
    if not any(_bool_value(data.get(field), True) for field in (
            "include_group", "include_individual", "include_split")):
        raise _field_validation_error(
            "include_group", "Выберите хотя бы один тип занятия.",
            code="required")
    batch, rows = preview_copy_period(
        actor=user,
        source_from=dates["source_from"],
        source_to=dates["source_to"],
        target_from=dates["target_from"],
        target_to=dates["target_to"],
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
    batch_id = _positive_int(data.get("batch_id"), "batch_id")
    selected_indices = data.get("selected_indices")
    if not isinstance(selected_indices, list) or not selected_indices:
        raise _field_validation_error(
            "selected_indices", "Выберите занятия для копирования.",
            code="required")
    parsed_indices = []
    for index in selected_indices:
        if isinstance(index, bool):
            raise _field_validation_error(
                "selected_indices", "Некорректный список выбранных занятий.",
                code="invalid_integer")
        try:
            parsed_index = int(index)
        except (TypeError, ValueError) as exc:
            raise _field_validation_error(
                "selected_indices", "Некорректный список выбранных занятий.",
                code="invalid_integer") from exc
        if parsed_index <= 0:
            raise _field_validation_error(
                "selected_indices", "Некорректный список выбранных занятий.",
                code="invalid_choice")
        parsed_indices.append(parsed_index)
    batch, created, skipped = commit_copy_period(
        batch_id=batch_id,
        actor=user,
        selected_indices=parsed_indices,
    )
    return JsonResponse({
        "batch_id": batch.id,
        "created_count": len(created),
        "skipped": skipped,
        "skipped_count": len(skipped),
    }, status=201)


def _session_attendance_payload(session):
    roster = (
        split_roster_students(session)
        if session.session_type == SessionType.SPLIT
        else list(_session_roster(session))
    )
    student_ids = [student.id for student in roster]
    charge_totals = {
        row["student_id"]: row["total"] or 0
        for row in Charge.objects.filter(student_id__in=student_ids)
        .values("student_id").annotate(total=Sum("amount_minor"))
    }
    payment_totals = {
        row["student_id"]: row["total"] or 0
        for row in Payment.objects.filter(
            student_id__in=student_ids,
            status=PaymentStatus.CONFIRMED,
        ).values("student_id").annotate(total=Sum("amount_minor"))
    }
    attendance = {record.student_id: record for record in session.attendance.select_related("student")}
    split_roster_locked = session.session_type == SessionType.SPLIT and bool(attendance)
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
            "balance_minor": charge_totals.get(student.id, 0) - payment_totals.get(student.id, 0),
            "currency": settings.DEFAULT_CURRENCY,
            "attendance": _attendance_payload(attendance[student.id]) if student.id in attendance else None,
            "session_participant": {
                "id": one_off_participants[student.id].id,
                "source": one_off_participants[student.id].source,
                "status": one_off_participants[student.id].status,
                "note": one_off_participants[student.id].note,
            } if student.id in one_off_participants else None,
            "can_remove_from_session": (
                student.id in one_off_participants and not split_roster_locked
            ),
        } for student in roster],
    }


@require_http_methods(["GET", "POST"])
def admin_schedule_sessions(request):
    user = _admin_required(request)
    if request.method == "POST":
        try:
            session = _create_session_from_data(_json_body(request), actor=user)
        except ScheduleConflict as exc:
            raise ValidationError({
                "start_at": ValidationError(
                    exc.messages[0], code="schedule_conflict")
            }) from exc
        return JsonResponse(_session_payload(session), status=201)
    qs = Session.objects.select_related(
        "group", "trainer__user", "substitute_trainer__user",
        "individual_student__parent__user", "template"
    ).prefetch_related(
        "participants__student__parent__user"
    ).order_by("start_at", "id")
    date_from = _parse_date(request.GET.get("date_from"), "date_from")
    date_to = _parse_date(request.GET.get("date_to"), "date_to")
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    if request.GET.get("trainer_id"):
        qs = qs.filter(trainer_id=_positive_int(
            request.GET["trainer_id"], "trainer_id"))
    if request.GET.get("group_id"):
        qs = qs.filter(group_id=_positive_int(
            request.GET["group_id"], "group_id"))
    if request.GET.get("cancelled") in {"true", "false"}:
        qs = qs.filter(is_cancelled=request.GET["cancelled"] == "true")
    type_colors = session_type_color_keys()
    return JsonResponse(paginated_payload(
        request,
        qs,
        key="sessions",
        serializer=lambda session: _session_payload(session, type_color_keys=type_colors),
    ))


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
@transaction.atomic
def admin_schedule_session_detail(request, session_id):
    user = _admin_required(request)
    sessions = Session.objects.select_related(
            "group", "trainer__user", "substitute_trainer__user",
            "individual_student__parent__user", "template"
        )
    if request.method != "GET":
        sessions = sessions.select_for_update(of=("self",))
    session = get_object_or_404(sessions, pk=session_id)
    if request.method == "DELETE":
        data = _json_body(request)
        if data.get("force") is not True or str(data.get("confirm_session_id")) != str(session.id):
            raise ValidationError("Подтвердите удаление точным ID занятия")
        deleted_id = delete_session(session, actor=user, force=True)
        return JsonResponse({"deleted": True, "session_id": deleted_id})
    if request.method in {"POST", "PATCH"}:
        data = _json_body(request)
        changes = _session_changes_from_data(data, current_session=session)
        group_changed = (
            "group" in changes
            and getattr(changes["group"], "id", None) != session.group_id
        )
        has_attendance = session.attendance.exists()
        has_financial_history = (
            has_attendance
            or Charge.objects.filter(attendance__session=session).exists()
        )
        if group_changed and session.start_at <= timezone.now():
            raise _field_validation_error(
                "group_id",
                "Группу можно менять только у будущего занятия.",
                code="historical_session",
            )
        if group_changed and has_financial_history:
            raise _field_validation_error(
                "group_id",
                "Группу нельзя менять после появления посещений или начислений.",
                code="financial_history_locked",
            )
        final_type = changes.get("session_type", session.session_type)
        final_group = changes.get("group", session.group)
        if (
            final_type == SessionType.GROUP
            and final_group is not None
            and session.start_at > timezone.now()
            and not has_financial_history
        ):
            # A future group session follows the current tariff of its group.
            # Saving also repairs a stale snapshot after the tariff changed.
            changes["price_minor"] = final_group.price_minor
            changes["currency"] = final_group.currency
        final_student = changes.get("individual_student", session.individual_student)
        second_student = _split_second_student_from_data(
            data,
            session_type=final_type,
            individual_student=final_student,
        )
        current_second = split_second_participant(session)
        preserved_extra_ids = set(session.participants.filter(
            status=SessionParticipantStatus.ACTIVE,
        ).exclude(
            pk=current_second.pk if current_second is not None else None,
        ).values_list("student_id", flat=True))
        desired_second_id = (
            current_second.student_id if (
                second_student is _SECOND_STUDENT_UNSET
                and current_second is not None
            ) else getattr(second_student, "id", None)
        )
        if (
            final_type == SessionType.SPLIT
            and final_student is not None
            and (
                final_student.id == desired_second_id
                or final_student.id in preserved_extra_ids
            )
        ):
            raise _field_validation_error(
                "individual_student_id",
                "Клиент 1 уже входит в состав Split-тренировки.",
                code="duplicate",
            )
        changes_base_student = (
            "individual_student" in changes
            and getattr(changes["individual_student"], "id", None) != session.individual_student_id
            and session.session_type == SessionType.SPLIT
        )
        changes_split_type = (
            "session_type" in changes
            and changes["session_type"] != session.session_type
            and (
                session.session_type == SessionType.SPLIT
                or changes["session_type"] == SessionType.SPLIT
            )
        )
        leaves_split_with_extras = (
            session.session_type == SessionType.SPLIT
            and final_type != SessionType.SPLIT
            and session.participants.filter(
                status=SessionParticipantStatus.ACTIVE,
            ).exists()
        )
        if leaves_split_with_extras:
            raise _field_validation_error(
                "session_type",
                "Сначала удалите дополнительных участников Split-тренировки.",
                code="roster_not_empty",
            )
        if (
            (changes_base_student or changes_split_type)
            and session.attendance.exists()
        ):
            raise ValidationError(
                "Состав Split нельзя менять после появления отметок посещаемости."
            )
        try:
            edit_single_session(session, actor=user, **changes)
        except ScheduleConflict as exc:
            raise ValidationError({
                "start_at": ValidationError(
                    exc.messages[0], code="schedule_conflict")
            }) from exc
        if second_student is not _SECOND_STUDENT_UNSET:
            try:
                sync_split_second_student(session, second_student, actor=user)
            except ValidationError as exc:
                if "already an additional" in str(exc):
                    raise _field_validation_error(
                        "second_student_id",
                        "Участник уже входит в дополнительный состав.",
                        code="duplicate",
                    ) from exc
                raise
        if (
            final_type == SessionType.SPLIT
            and (
                "max_participants" in changes
                or "session_type" in changes
                or "individual_student" in changes
                or second_student is not _SECOND_STUDENT_UNSET
            )
        ):
            _ensure_capacity_for_roster(session)
        return JsonResponse(_session_payload(session))
    return JsonResponse(_session_payload(session))


@require_http_methods(["GET", "POST"])
@transaction.atomic
def admin_schedule_session_attendance(request, session_id):
    user = _admin_required(request)
    sessions = Session.objects.select_related(
        "group", "trainer__user", "substitute_trainer__user", "individual_student"
    )
    if request.method == "POST":
        sessions = sessions.select_for_update(of=("self",))
    session = get_object_or_404(sessions, pk=session_id)
    if request.method == "POST":
        data = _json_body(request)
        try:
            student_id = int(data.get("student_id"))
        except (TypeError, ValueError) as exc:
            raise _field_validation_error(
                "student_id", "Выберите участника.", code="required") from exc
        status = data.get("status")
        if status not in AttendanceStatus.values:
            raise _field_validation_error(
                "status", "Выберите допустимый статус посещения.",
                code="invalid_choice")
        allowed_student_ids = set(
            split_roster_student_ids(session)
            if session.session_type == SessionType.SPLIT
            else _session_roster(session).values_list("id", flat=True)
        )
        if student_id not in allowed_student_ids:
            raise _field_validation_error(
                "student_id", "Участник недоступен в этом занятии.",
                code="invalid_choice")
        record = set_attendance(session_id=session.id, student=Student.objects.get(pk=student_id),
                                status=status, actor=user)
        return JsonResponse(_attendance_payload(record))

    return JsonResponse(_session_attendance_payload(session))


@require_POST
@transaction.atomic
def admin_schedule_session_attendance_bulk(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(Session.objects.select_for_update(), pk=session_id)
    if session.is_cancelled:
        raise ValidationError("cancelled session is read-only")
    items = _json_body(request).get("items")
    if not isinstance(items, list) or not items:
        raise _field_validation_error(
            "items", "Добавьте хотя бы одну отметку посещения.",
            code="required")
    allowed_student_ids = set(
        split_roster_student_ids(session)
        if session.session_type == SessionType.SPLIT
        else _session_roster(session).values_list("id", flat=True)
    )
    normalized = []
    seen = set()
    for index, item in enumerate(items):
        try:
            student_id = int(item.get("student_id"))
        except (AttributeError, TypeError, ValueError) as exc:
            raise _field_validation_error(
                f"items.{index}.student_id", "Выберите участника.",
                code="required") from exc
        status = item.get("status")
        if student_id in seen:
            raise _field_validation_error(
                f"items.{index}.student_id",
                "Участник указан в списке повторно.", code="duplicate")
        if student_id not in allowed_student_ids:
            raise _field_validation_error(
                f"items.{index}.student_id",
                "Участник недоступен в этом занятии.",
                code="invalid_choice")
        if status not in AttendanceStatus.values:
            raise _field_validation_error(
                f"items.{index}.status",
                "Выберите допустимый статус посещения.",
                code="invalid_choice")
        seen.add(student_id)
        normalized.append((student_id, status))
    students = Student.objects.in_bulk(seen)
    records = [
        set_attendance(
            session_id=session.id,
            student=students[student_id],
            status=status,
            actor=user,
        )
        for student_id, status in normalized
    ]
    return JsonResponse({
        "session_id": session.id,
        "updated_count": len(records),
        "results": [_attendance_payload(record) for record in records],
    })


@require_POST
@transaction.atomic
def admin_schedule_session_participants(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_for_update(of=("self",)).select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student"
        ),
        pk=session_id,
    )
    data = _json_body(request)
    if session.is_cancelled:
        raise ValidationError("cancelled sessions cannot receive participants")
    require_mutable_split_roster(session)
    try:
        student_id = int(data.get("student_id"))
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            "student_id", "Выберите участника.", code="required") from exc
    student = _object_for_field(
        Student.objects.select_related("parent__user").prefetch_related("groups"),
        student_id, "student_id", "участника")
    _require_active_participant(
        student, "be added to sessions", field="student_id")

    existing_active_ids = set(
        split_roster_student_ids(session)
        if session.session_type == SessionType.SPLIT
        else _session_roster(session).values_list("id", flat=True)
    )
    participant = SessionParticipant.objects.filter(session=session, student=student).first()
    if student.id in existing_active_ids:
        raise _field_validation_error(
            "student_id", "Участник уже добавлен в это занятие.",
            code="duplicate")
    if student.id not in existing_active_ids and len(existing_active_ids) >= session.max_participants:
        raise _field_validation_error(
            "student_id",
            f"В занятии нет свободных мест (вместимость: {session.max_participants}).",
            code="capacity_full")

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
@transaction.atomic
def admin_schedule_session_participant_detail(request, session_id, student_id):
    user = _admin_required(request)
    session = get_object_or_404(
        Session.objects.select_for_update(of=("self",)).select_related(
            "group", "trainer__user", "substitute_trainer__user", "individual_student"
        ),
        pk=session_id,
    )
    require_mutable_split_roster(session)
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
            raise _field_validation_error(
                "student_id", "Выберите участника.", code="required") from exc
        student = _object_for_field(
            Student.objects.select_related("parent__user").prefetch_related("groups"),
            student_id, "student_id", "участника")
        _require_active_participant(
            student, "be added to the waitlist", field="student_id")
        if WaitlistEntry.objects.filter(session=session, student_id=student_id).exists():
            raise _field_validation_error(
                "student_id", "Участник уже находится в листе ожидания.",
                code="duplicate")
        entry = WaitlistEntry(session=session, student=student)
        _apply_waitlist_data(entry, data)
        audit(user, "waitlist.created", entry, {
            "session_id": session.id,
            "student_id": entry.student_id,
            "status": entry.status,
        })
        return JsonResponse(_waitlist_payload(entry), status=201)
    qs = session.waitlist_entries.select_related("student", "student__parent").prefetch_related("student__groups")
    if request.GET.get("status"):
        qs = qs.filter(status=request.GET["status"])
    return JsonResponse({
        "waitlist": [_waitlist_payload(entry) for entry in qs.order_by("priority", "created_at", "id")[:200]],
    })


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_schedule_waitlist_entry_detail(request, entry_id):
    user = _admin_required(request)
    entry = get_object_or_404(
        WaitlistEntry.objects.select_related("session", "student", "student__parent").prefetch_related("student__groups"),
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
        WaitlistEntry.objects.select_related("session", "student", "student__parent").prefetch_related("student__groups"),
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
def admin_schedule_session_restore(request, session_id):
    user = _admin_required(request)
    session = get_object_or_404(Session, pk=session_id)
    try:
        session, restored = restore_session(session, actor=user)
    except ScheduleConflict as exc:
        raise _field_validation_error(
            "start_at", exc.messages[0], code="schedule_conflict") from exc
    payload = _session_payload(session)
    payload["restored"] = restored
    return JsonResponse(payload)


@require_POST
def admin_schedule_check_conflict(request):
    _admin_required(request)
    data = _json_body(request)
    trainer = _object_for_field(
        Trainer.objects.filter(is_active=True, user__is_active=True),
        data.get("trainer_id"), "trainer_id", "тренера")
    try:
        start_at = _parse_datetime(data.get("start_at"), "start_at")
        if start_at is None:
            raise _field_validation_error(
                "start_at", "Укажите дату и время начала.", code="required")
        if data.get("end_at"):
            end_at = _parse_datetime(data.get("end_at"), "end_at")
            _duration_minutes(start_at=start_at, end_at=end_at)
        else:
            duration_minutes = _duration_minutes(
                start_at=start_at,
                duration_minutes=data.get("duration_minutes"),
            )
            end_at = start_at + timedelta(minutes=duration_minutes)
        exclude_session_id = data.get("exclude_session_id")
        if exclude_session_id not in (None, ""):
            exclude_session_id = _positive_int(
                exclude_session_id, "exclude_session_id")
        check_trainer_conflict(
            trainer,
            start_at,
            end_at,
            exclude_session_id=exclude_session_id,
        )
    except ScheduleConflict as exc:
        message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
        return JsonResponse({
            "has_conflict": True,
            "error": "Проверьте отмеченные поля.",
            "code": "validation_error",
            "errors": {
                "start_at": [{"code": "schedule_conflict", "message": message}],
            },
            "non_field_errors": [],
        })
    return JsonResponse({"has_conflict": False})


