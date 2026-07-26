"""Rule 4 & 5: session generation from templates, series edits, conflict control."""
from datetime import datetime, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from audit.models import audit
from students.models import Student

from .models import (RecurringTemplate, ScheduleBatchStatus, ScheduleOperationBatch,
                     Session, SessionParticipant, SessionTypeConfig,
                     SessionParticipantSource, SessionParticipantStatus,
                     SessionType, WaitlistEntry, WaitlistStatus, WeeklyPlan)


class ScheduleConflict(ValidationError):
    """Raised when creating/generating a session would violate rule 5."""


def _overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def check_trainer_conflict(trainer, start_at, end_at, exclude_session_id=None):
    """Rule 5: a trainer cannot be in two places at the same time.

    Substitutions make the substitute the effective trainer for that session,
    while preserving the originally scheduled trainer for history.
    """
    qs = Session.objects.filter(is_cancelled=False).filter(
        Q(trainer=trainer, substitute_trainer__isnull=True) |
        Q(substitute_trainer=trainer)
    )
    if exclude_session_id:
        qs = qs.exclude(pk=exclude_session_id)
    # narrow by day window to keep the scan small, then check exact overlap
    qs = qs.filter(start_at__lt=end_at, end_at__gt=start_at)
    if qs.exists():
        raise ScheduleConflict(
            f"Конфликт: тренер уже занят в интервале "
            f"{timezone.localtime(start_at):%d.%m %H:%M}–{timezone.localtime(end_at):%H:%M}")


def session_roster_students(session):
    """Return the effective roster: base group/individual student plus active one-off participants."""
    participant_ids = session.participants.filter(
        status=SessionParticipantStatus.ACTIVE,
    ).values_list("student_id", flat=True)
    if session.individual_student_id:
        condition = Q(pk=session.individual_student_id) | Q(pk__in=participant_ids)
    elif session.group_id:
        condition = Q(group_id=session.group_id, is_active=True) | Q(pk__in=participant_ids)
    else:
        condition = Q(pk__in=participant_ids)
    return Student.objects.filter(
        condition,
        is_active=True,
        parent__user__is_active=True,
    ).select_related("parent", "parent__user", "group").distinct()


@transaction.atomic
def promote_waitlist_entry(entry, *, actor=None):
    """Promote an active waitlist row into the concrete session roster."""
    entry = WaitlistEntry.objects.select_for_update().select_related(
        "session", "student", "student__parent__user").get(pk=entry.pk)
    session = Session.objects.select_for_update().get(pk=entry.session_id)
    if session.is_cancelled:
        raise ValidationError("cancelled sessions cannot promote waitlist entries")
    if entry.status != WaitlistStatus.ACTIVE:
        raise ValidationError("only active waitlist entries can be promoted")
    if not entry.student.is_active:
        raise ValidationError("archived participant cannot be promoted from waitlist")
    if entry.student.parent_id and not entry.student.parent.user.is_active:
        raise ValidationError("archived client account cannot be promoted from waitlist")

    roster_ids = set(session_roster_students(session).values_list("id", flat=True))
    if entry.student_id in roster_ids:
        raise ValidationError("student is already in this session roster")
    if len(roster_ids) >= session.max_participants:
        raise ValidationError(f"session capacity is full ({session.max_participants})")

    participant, created = SessionParticipant.objects.get_or_create(
        session=session,
        student=entry.student,
        defaults={
            "source": SessionParticipantSource.WAITLIST,
            "status": SessionParticipantStatus.ACTIVE,
            "note": entry.note,
        },
    )
    if not created:
        participant.source = SessionParticipantSource.WAITLIST
        participant.status = SessionParticipantStatus.ACTIVE
        participant.note = entry.note
        participant.full_clean()
        participant.save(update_fields=["source", "status", "note", "updated_at"])

    entry.status = WaitlistStatus.PROMOTED
    entry.full_clean()
    entry.save(update_fields=["status", "updated_at"])
    if actor is not None:
        audit(actor, "waitlist.promoted", entry, {
            "session_id": session.id,
            "student_id": entry.student_id,
            "participant_id": participant.id,
        })
    return entry, participant


def _duration_minutes(*, start_at, end_at=None, duration_minutes=None):
    duration_was_explicit = duration_minutes is not None
    if duration_minutes is None:
        if end_at is None:
            raise ValidationError("duration_minutes or end_at is required")
        duration_minutes = round((end_at - start_at).total_seconds() / 60)
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError) as exc:
        raise ValidationError("duration_minutes must be an integer") from exc
    if not 15 <= duration_minutes <= 480 or duration_minutes % 5:
        raise ValidationError(
            "duration_minutes must be between 15 and 480 in five-minute increments")
    if end_at is not None and duration_was_explicit:
        expected_end = start_at + timedelta(minutes=duration_minutes)
        if end_at != expected_end:
            raise ValidationError("end_at conflicts with duration_minutes")
    return duration_minutes


def _tariff_snapshot(session_type, group):
    if group is not None:
        return group.price_minor, group.currency
    config = SessionTypeConfig.objects.filter(code=session_type, is_active=True).first()
    if config is None:
        return None, settings.DEFAULT_CURRENCY
    return config.default_price_minor, config.default_currency


def _session_type_defaults(session_type):
    return SessionTypeConfig.objects.filter(code=session_type, is_active=True).first()


@transaction.atomic
def create_session(*, trainer, start_at, end_at=None, duration_minutes=None, location, max_participants,
                   group=None, template=None, session_type=SessionType.GROUP,
                   individual_student=None, manually_modified=False, actor=None,
                   weekly_plan_slot=None, notes=""):
    defaults = _session_type_defaults(session_type)
    if duration_minutes is None and end_at is None:
        duration_minutes = defaults.default_duration_minutes if defaults else 60
    duration_minutes = _duration_minutes(
        start_at=start_at, end_at=end_at, duration_minutes=duration_minutes)
    end_at = start_at + timedelta(minutes=duration_minutes)
    check_trainer_conflict(trainer, start_at, end_at)
    price_minor, currency = _tariff_snapshot(session_type, group)
    session = Session(
        trainer=trainer, start_at=start_at, end_at=end_at, location=location,
        max_participants=max_participants, group=group, template=template,
        weekly_plan_slot=weekly_plan_slot,
        session_type=session_type, individual_student=individual_student,
        is_manually_modified=manually_modified,
        price_minor=price_minor, currency=currency, duration_minutes=duration_minutes,
        notes=notes,
    )
    session.full_clean(exclude=["template", "group", "individual_student"])
    session.save()
    # Bulk generation passes actor=None and logs one summary entry instead.
    if actor is not None:
        audit(actor, "session.created", session, {"type": str(session_type)})
    return session


@transaction.atomic
def generate_sessions(template: RecurringTemplate, date_from, date_to, *,
                      skip_conflicts=False, actor=None):
    """Rule 4: generate concrete Sessions from a template for [date_from, date_to]."""
    if not template.is_active:
        raise ValidationError("Шаблон неактивен")
    created, skipped = [], []
    day = date_from
    while day <= date_to:
        if day.weekday() == template.weekday:
            start_at = timezone.make_aware(datetime.combine(day, template.start_time))
            end_at = timezone.make_aware(datetime.combine(day, template.end_time))
            try:
                session = create_session(
                    trainer=template.trainer, start_at=start_at, end_at=end_at,
                    location=template.location, max_participants=template.max_participants,
                    group=template.group, template=template, session_type=SessionType.GROUP)
                created.append(session)
            except ScheduleConflict:
                if not skip_conflicts:
                    raise
                skipped.append(day)
        day += timedelta(days=1)
    if actor is not None:
        audit(actor, "schedule.generated", template,
              {"created": len(created), "skipped": len(skipped),
               "from": str(date_from), "to": str(date_to)})
    return created, skipped


@transaction.atomic
def generate_weekly_plan(plan: WeeklyPlan, date_from, date_to, *,
                         skip_conflicts=False, actor=None):
    if not plan.is_active:
        raise ValidationError("Недельный план неактивен")
    slots = list(plan.slots.filter(is_active=True).select_related("trainer__user"))
    created = []
    skipped = []
    day = date_from
    while day <= date_to:
        for slot in slots:
            if slot.weekday != day.weekday():
                continue
            start_at = timezone.make_aware(datetime.combine(day, slot.start_time))
            try:
                created.append(create_session(
                    trainer=slot.trainer,
                    start_at=start_at,
                    duration_minutes=slot.duration_minutes,
                    location=slot.location,
                    max_participants=slot.max_participants,
                    group=plan.group,
                    session_type=SessionType.GROUP,
                    weekly_plan_slot=slot,
                ))
            except ScheduleConflict as exc:
                if not skip_conflicts:
                    raise
                skipped.append({
                    "slot_id": slot.id,
                    "date": day.isoformat(),
                    "error": "; ".join(exc.messages),
                })
        day += timedelta(days=1)
    if actor is not None:
        audit(actor, "weekly_plan.generated", plan, {
            "created": len(created),
            "skipped": len(skipped),
            "from": str(date_from),
            "to": str(date_to),
        })
    return created, skipped


def _copy_period_rows(params):
    source_from = params["source_from"]
    source_to = params["source_to"]
    target_from = params["target_from"]
    target_to = params["target_to"]
    included_types = {
        session_type for session_type in SessionType.values
        if params.get(f"include_{session_type}", False)
    }
    source_sessions = Session.objects.filter(
        start_at__date__gte=source_from,
        start_at__date__lte=source_to,
        is_cancelled=False,
        session_type__in=included_types,
    ).select_related(
        "trainer__user", "group", "individual_student",
    ).prefetch_related("participants__student__parent__user").order_by("start_at", "id")
    rows = []
    for source in source_sessions:
        day_offset = (timezone.localdate(source.start_at) - source_from).days
        target_day = target_from + timedelta(days=day_offset)
        if target_day > target_to:
            continue
        local_start = timezone.localtime(source.start_at)
        target_start = timezone.make_aware(datetime.combine(target_day, local_start.time()))
        status = "ready"
        errors = []
        if not source.trainer.is_active or not source.trainer.user.is_active:
            status = "error"
            errors.append("Тренер неактивен")
        if source.individual_student_id:
            student = source.individual_student
            if not student.is_active or not student.parent.user.is_active:
                status = "error"
                errors.append("Клиент неактивен")
        duplicate = Session.objects.filter(
            start_at=target_start,
            session_type=source.session_type,
            group_id=source.group_id,
            individual_student_id=source.individual_student_id,
        ).exists()
        if duplicate:
            status = "duplicate"
            errors.append("Занятие уже существует")
        if status == "ready":
            try:
                check_trainer_conflict(
                    source.trainer,
                    target_start,
                    target_start + timedelta(minutes=source.duration_minutes),
                )
            except ScheduleConflict as exc:
                status = "conflict"
                errors.extend(exc.messages)
        rows.append({
            "index": len(rows) + 1,
            "source_session_id": source.id,
            "target_start_at": target_start.isoformat(),
            "session_type": source.session_type,
            "status": status,
            "errors": errors,
        })
    return rows


def preview_copy_period(*, actor, source_from, source_to, target_from, target_to,
                        include_group=True, include_individual=True, include_split=True):
    if source_to < source_from or target_to < target_from:
        raise ValidationError("Некорректный диапазон дат")
    params = {
        "source_from": source_from,
        "source_to": source_to,
        "target_from": target_from,
        "target_to": target_to,
        "include_group": bool(include_group),
        "include_individual": bool(include_individual),
        "include_split": bool(include_split),
    }
    rows = _copy_period_rows(params)
    batch = ScheduleOperationBatch.objects.create(
        created_by=actor,
        input_data={
            key: value.isoformat() if hasattr(value, "isoformat") else value
            for key, value in params.items()
        },
        preview=rows,
        expires_at=timezone.now() + timedelta(minutes=30),
    )
    return batch, rows


@transaction.atomic
def commit_copy_period(*, batch_id, actor, selected_indices):
    batch = ScheduleOperationBatch.objects.select_for_update().filter(
        pk=batch_id,
        created_by=actor,
        status=ScheduleBatchStatus.PREVIEWED,
        expires_at__gt=timezone.now(),
    ).first()
    if batch is None:
        raise ValidationError("Schedule batch не найден, истёк или уже применён")
    params = dict(batch.input_data)
    for key in ("source_from", "source_to", "target_from", "target_to"):
        params[key] = datetime.fromisoformat(params[key]).date()
    current_rows = _copy_period_rows(params)
    selected = {int(index) for index in selected_indices}
    available = {row["index"] for row in current_rows}
    if not selected or selected - available:
        raise ValidationError("Выбраны неизвестные строки schedule batch")
    created = []
    skipped = []
    for row in current_rows:
        if row["index"] not in selected:
            continue
        if row["status"] != "ready":
            skipped.append(row)
            continue
        source = Session.objects.select_related(
            "trainer", "group", "individual_student").prefetch_related(
            "participants__student").get(pk=row["source_session_id"])
        target_start = datetime.fromisoformat(row["target_start_at"])
        session = create_session(
            trainer=source.trainer,
            start_at=target_start,
            duration_minutes=source.duration_minutes,
            location=source.location,
            max_participants=source.max_participants,
            group=source.group,
            session_type=source.session_type,
            individual_student=source.individual_student,
            notes=source.notes,
        )
        if source.session_type == SessionType.SPLIT:
            for participant in source.participants.filter(
                    status=SessionParticipantStatus.ACTIVE).select_related("student"):
                student = participant.student
                if not student.is_active or not student.parent.user.is_active:
                    continue
                SessionParticipant.objects.get_or_create(
                    session=session,
                    student=student,
                    defaults={
                        "source": SessionParticipantSource.MANUAL,
                        "status": SessionParticipantStatus.ACTIVE,
                        "note": participant.note,
                    },
                )
        created.append(session)
    batch.status = ScheduleBatchStatus.COMMITTED
    batch.committed_at = timezone.now()
    batch.result = {"created": len(created), "skipped": len(skipped)}
    batch.save(update_fields=["status", "committed_at", "result"])
    audit(actor, "schedule.period_copied", batch, {
        **batch.result,
        "selected": len(selected),
    })
    return batch, created, skipped


@transaction.atomic
def cancel_series(template: RecurringTemplate, date_from=None, *, actor=None):
    """Rule 4: change the whole series — cancel future generated sessions."""
    qs = template.sessions.filter(is_cancelled=False)
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    count = qs.update(is_cancelled=True)
    if actor is not None:
        audit(actor, "schedule.series_cancelled", template,
              {"count": count, "from": str(date_from) if date_from else None})
    return count


def deletion_preview(session: Session):
    return {
        "session_id": session.id,
        "can_force_delete": (
            session.start_at > timezone.now()
            and not session.attendance.exists()
            and not session.payroll_calculations.exists()
        ),
        "is_future": session.start_at > timezone.now(),
        "attendance_count": session.attendance.count(),
        "payroll_calculation_count": session.payroll_calculations.count(),
        "participant_count": session.participants.filter(
            status=SessionParticipantStatus.ACTIVE).count(),
        "waitlist_count": session.waitlist_entries.filter(status=WaitlistStatus.ACTIVE).count(),
    }


@transaction.atomic
def delete_session(session: Session, *, actor=None, force=False):
    """Delete a session that carries no history — a mistyped or duplicated entry.

    Attendance is immutable (attendance.signals blocks the cascade) and payroll
    PROTECTs its session, so both would abort mid-transaction with an opaque
    error. Check them up front and point the admin at cancellation instead,
    which is the right tool once a class has actually happened.
    """
    preview = deletion_preview(session)
    if not force:
        raise ValidationError("Для удаления будущего занятия требуется явное force-подтверждение")
    if not preview["is_future"]:
        raise ValidationError("Можно удалить только будущее занятие; проведённое отмените")
    if session.attendance.exists():
        raise ValidationError(
            "Занятие с отметками посещаемости нельзя удалить — отмените его")
    if session.payroll_calculations.exists():
        raise ValidationError(
            "Занятие с начисленной зарплатой нельзя удалить — отмените его")
    session_id = session.pk
    label = str(session)
    if actor is not None:
        audit(actor, "session.deleted", session, {
            "session": session_id, "label": label, "force": True, "preview": preview})
    session.delete()  # cascades the roster: SessionParticipant + WaitlistEntry
    return session_id


def edit_single_session(session: Session, *, actor=None, **changes):
    """Rule 4: edit ONE class of a series without touching the rest.
    Marks the session as manually modified so future series edits skip it."""
    new_trainer = changes.get("substitute_trainer") or changes.get("trainer", session.trainer)
    new_start = changes.get("start_at", session.start_at)
    duration_minutes = _duration_minutes(
        start_at=new_start,
        end_at=changes.get("end_at") if "end_at" in changes else None,
        duration_minutes=(changes["duration_minutes"] if "duration_minutes" in changes
                          else (None if "end_at" in changes else session.duration_minutes)),
    )
    new_end = new_start + timedelta(minutes=duration_minutes)
    changes["end_at"] = new_end
    changes["duration_minutes"] = duration_minutes
    if "price_minor" in changes and session.start_at <= timezone.now():
        raise ValidationError("Цена занятия блокируется после его начала")
    if new_trainer is not None:
        check_trainer_conflict(new_trainer, new_start, new_end, exclude_session_id=session.pk)
    for field, value in changes.items():
        setattr(session, field, value)
    session.is_manually_modified = True
    session.full_clean(exclude=["template", "group", "individual_student"])
    session.save()
    if actor is not None:
        audit(actor, "session.edited", session, {"fields": list(changes.keys())})
    return session
