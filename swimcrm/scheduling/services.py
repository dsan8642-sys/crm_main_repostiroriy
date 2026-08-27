"""Schedule creation, period copy, single-session edits and conflict control."""
from datetime import datetime, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from audit.models import audit
from students.models import Student

from .models import (ScheduleBatchStatus, ScheduleOperationBatch,
                     Session, SessionParticipant, SessionTypeConfig,
                     SessionParticipantSource, SessionParticipantStatus,
                     SessionType, WaitlistEntry, WaitlistStatus)


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
            f"Конфликт: тренер {trainer} уже занят в интервале "
            f"{timezone.localtime(start_at):%d.%m %H:%M}–{timezone.localtime(end_at):%H:%M}")


def session_roster_students(session):
    """Return the effective roster: base group/individual student plus active one-off participants."""
    participant_ids = session.participants.filter(
        status=SessionParticipantStatus.ACTIVE,
    ).values_list("student_id", flat=True)
    if session.individual_student_id:
        condition = Q(pk=session.individual_student_id) | Q(pk__in=participant_ids)
    elif session.group_id:
        condition = Q(groups__id=session.group_id, is_active=True) | Q(pk__in=participant_ids)
    else:
        condition = Q(pk__in=participant_ids)
    return Student.objects.filter(
        condition,
        is_active=True,
        parent__user__is_active=True,
    ).select_related("parent", "parent__user").prefetch_related("groups").distinct()


def split_roster_student_ids(session):
    """Stable enrolled Split roster, including participants archived later."""
    if session.session_type != SessionType.SPLIT:
        return []
    student_ids = []
    if session.individual_student_id:
        student_ids.append(session.individual_student_id)
    student_ids.extend(session.participants.filter(
        status=SessionParticipantStatus.ACTIVE,
    ).order_by("created_at", "id").values_list("student_id", flat=True))
    return list(dict.fromkeys(student_ids))


def split_roster_students(session):
    """Ordered enrolled Split students, including participants archived later."""
    student_ids = split_roster_student_ids(session)
    students = Student.objects.filter(pk__in=student_ids).select_related(
        "parent", "parent__user").prefetch_related("groups")
    by_id = {student.id: student for student in students}
    return [by_id[student_id] for student_id in student_ids if student_id in by_id]


def split_roster_is_locked(session):
    """A recorded attendance row makes a split roster historical."""
    return (
        session.session_type == SessionType.SPLIT
        and session.attendance.exists()
    )


def require_mutable_split_roster(session):
    if split_roster_is_locked(session):
        raise ValidationError(
            "Состав Split нельзя менять после появления отметок посещаемости."
        )


def split_second_participant(session):
    """Return the active participant occupying the stable second-client slot."""
    prefetched = getattr(session, "_prefetched_objects_cache", {}).get("participants")
    rows = (
        sorted(prefetched, key=lambda participant: (
            participant.created_at, participant.id))
        if prefetched is not None
        else list(session.participants.order_by("created_at", "id"))
    )
    if not rows:
        return None
    second_position = rows[0].created_at
    return next((
        participant for participant in rows
        if participant.created_at == second_position
        and participant.status == SessionParticipantStatus.ACTIVE
    ), None)


@transaction.atomic
def sync_split_second_student(session, second_student, *, actor=None):
    """Set the first additional Split participant, preserving later additions."""
    if session.session_type != SessionType.SPLIT:
        raise ValidationError("second_student_id is available only for split sessions")

    rows = list(session.participants.select_related("student").order_by(
        "created_at", "id"))
    second_position = rows[0].created_at if rows else None
    active = [
        participant for participant in rows
        if participant.status == SessionParticipantStatus.ACTIVE
    ]
    current = next((
        participant for participant in active
        if participant.created_at == second_position
    ), None)
    desired_id = second_student.id if second_student is not None else None
    if current is not None and current.student_id == desired_id:
        return current
    if current is None and desired_id is None:
        return None

    require_mutable_split_roster(session)
    if desired_id is not None and any(
            participant.student_id == desired_id and participant != current
            for participant in active):
        raise ValidationError("student is already an additional split participant")

    before_id = current.student_id if current is not None else None
    if current is not None:
        current.status = SessionParticipantStatus.CANCELLED
        current.full_clean()
        current.save(update_fields=["status", "updated_at"])

    participant = None
    if second_student is not None:
        participant = next((
            row for row in rows if row.student_id == second_student.id
        ), None)
        if participant is None:
            participant = SessionParticipant(
                session=session,
                student=second_student,
            )
        participant.source = SessionParticipantSource.MANUAL
        participant.status = SessionParticipantStatus.ACTIVE
        if second_position is not None:
            participant.created_at = second_position
        participant.full_clean()
        participant.save()

    if actor is not None:
        audit(actor, "session.split_second_student_changed", session, {
            "before_student_id": before_id,
            "after_student_id": desired_id,
        })
    return participant


@transaction.atomic
def promote_waitlist_entry(entry, *, actor=None):
    """Promote an active waitlist row into the concrete session roster."""
    entry = WaitlistEntry.objects.select_for_update().select_related(
        "session", "student", "student__parent__user").get(pk=entry.pk)
    session = Session.objects.select_for_update().get(pk=entry.session_id)
    if session.is_cancelled:
        raise ValidationError("cancelled sessions cannot promote waitlist entries")
    require_mutable_split_roster(session)
    if entry.status != WaitlistStatus.ACTIVE:
        raise ValidationError("only active waitlist entries can be promoted")
    if not entry.student.is_active:
        raise ValidationError("archived participant cannot be promoted from waitlist")
    if entry.student.parent_id and not entry.student.parent.user.is_active:
        raise ValidationError("archived client account cannot be promoted from waitlist")

    roster_ids = set(
        split_roster_student_ids(session)
        if session.session_type == SessionType.SPLIT
        else session_roster_students(session).values_list("id", flat=True)
    )
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
            raise ValidationError({
                "duration_minutes": ValidationError(
                    "Укажите длительность занятия.", code="required")})
        duration_minutes = round((end_at - start_at).total_seconds() / 60)
    if isinstance(duration_minutes, bool) or (
            isinstance(duration_minutes, float)
            and not duration_minutes.is_integer()):
        raise ValidationError({
            "duration_minutes": ValidationError(
                "Длительность должна быть целым числом минут.",
                code="invalid_integer",
            )
        })
    try:
        duration_minutes = int(duration_minutes)
    except (TypeError, ValueError) as exc:
        raise ValidationError({
            "duration_minutes": ValidationError(
                "Длительность должна быть целым числом минут.",
                code="invalid_integer",
            )
        }) from exc
    if not 15 <= duration_minutes <= 480 or duration_minutes % 5:
        raise ValidationError({
            "duration_minutes": ValidationError(
                "Длительность должна быть от 15 до 480 минут с шагом 5 минут.",
                code="invalid_step",
            )
        })
    if end_at is not None and duration_was_explicit:
        expected_end = start_at + timedelta(minutes=duration_minutes)
        if end_at != expected_end:
            raise ValidationError({
                "duration_minutes": ValidationError(
                    "Длительность не совпадает со временем окончания.",
                    code="conflict",
                )
            })
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
                   group=None, session_type=SessionType.GROUP,
                   individual_student=None, manually_modified=False, actor=None,
                   weekly_plan_slot=None, notes="", price_minor=None, currency=None):
    defaults = _session_type_defaults(session_type)
    if duration_minutes is None and end_at is None:
        duration_minutes = defaults.default_duration_minutes if defaults else 60
    duration_minutes = _duration_minutes(
        start_at=start_at, end_at=end_at, duration_minutes=duration_minutes)
    end_at = start_at + timedelta(minutes=duration_minutes)
    check_trainer_conflict(trainer, start_at, end_at)
    default_price_minor, default_currency = _tariff_snapshot(session_type, group)
    if price_minor is None:
        price_minor = default_price_minor
    else:
        try:
            price_minor = int(price_minor)
        except (TypeError, ValueError) as exc:
            raise ValidationError({
                "price_minor": ValidationError(
                    "Укажите корректную цену.", code="invalid_integer"),
            }) from exc
        if price_minor < 0:
            raise ValidationError({
                "price_minor": ValidationError(
                    "Цена не может быть отрицательной.", code="min_value"),
            })
    currency = (currency or default_currency or settings.DEFAULT_CURRENCY).upper()
    session = Session(
        trainer=trainer, start_at=start_at, end_at=end_at, location=location,
        max_participants=max_participants, group=group,
        weekly_plan_slot=weekly_plan_slot,
        session_type=session_type, individual_student=individual_student,
        is_manually_modified=manually_modified,
        price_minor=price_minor, currency=currency, duration_minutes=duration_minutes,
        notes=notes,
    )
    session.full_clean(exclude=["template", "group", "individual_student"])
    session.save()
    if actor is not None:
        audit(actor, "session.created", session, {"type": str(session_type)})
    return session


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
        raise ValidationError({
            "batch_id": ValidationError(
                "Пакет копирования не найден, истёк или уже применён.",
                code="invalid_choice",
            ),
        })
    params = dict(batch.input_data)
    for key in ("source_from", "source_to", "target_from", "target_to"):
        params[key] = datetime.fromisoformat(params[key]).date()
    current_rows = _copy_period_rows(params)
    selected = {int(index) for index in selected_indices}
    available = {row["index"] for row in current_rows}
    if not selected or selected - available:
        raise ValidationError({
            "selected_indices": ValidationError(
                "Выбраны неизвестные занятия.", code="invalid_choice"),
        })
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
    price_is_changing = "price_minor" in changes or "currency" in changes
    has_financial_effect = (
        session.attendance.filter(charges__isnull=False).exists() or
        session.attendance.filter(ledger_entries__isnull=False).exists()
    )
    if price_is_changing and has_financial_effect:
        raise ValidationError("Session price is locked after a financial operation")
    if "price_minor" in changes and changes["price_minor"] is None:
        default_price, default_currency = _tariff_snapshot(
            changes.get("session_type", session.session_type),
            changes.get("group", session.group),
        )
        changes["price_minor"] = default_price
        changes.setdefault("currency", default_currency)
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


@transaction.atomic
def restore_session(session: Session, *, actor=None):
    """Restore one cancelled session without recreating it or its related history."""
    session = Session.objects.select_for_update(of=("self",)).select_related(
        "trainer", "substitute_trainer",
    ).get(pk=session.pk)
    if not session.is_cancelled:
        return session, False
    effective_trainer = session.substitute_trainer or session.trainer
    check_trainer_conflict(
        effective_trainer,
        session.start_at,
        session.end_at,
        exclude_session_id=session.pk,
    )
    session.is_cancelled = False
    session.is_manually_modified = True
    session.full_clean(exclude=["template", "group", "individual_student"])
    session.save(update_fields=["is_cancelled", "is_manually_modified"])
    if actor is not None:
        audit(actor, "session.restored", session, {"is_cancelled": False})
    return session, True
