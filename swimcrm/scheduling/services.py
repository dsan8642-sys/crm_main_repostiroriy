"""Rule 4 & 5: session generation from templates, series edits, conflict control."""
from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from audit.models import audit
from students.models import Student

from .models import (RecurringTemplate, Session, SessionParticipant,
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


@transaction.atomic
def create_session(*, trainer, start_at, end_at, location, max_participants,
                   group=None, template=None, session_type=SessionType.GROUP,
                   individual_student=None, manually_modified=False, actor=None):
    if end_at <= start_at:
        raise ValidationError("Время окончания должно быть позже начала")
    check_trainer_conflict(trainer, start_at, end_at)
    session = Session(
        trainer=trainer, start_at=start_at, end_at=end_at, location=location,
        max_participants=max_participants, group=group, template=template,
        session_type=session_type, individual_student=individual_student,
        is_manually_modified=manually_modified,
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


@transaction.atomic
def delete_session(session: Session, *, actor=None):
    """Delete a session that carries no history — a mistyped or duplicated entry.

    Attendance is immutable (attendance.signals blocks the cascade) and payroll
    PROTECTs its session, so both would abort mid-transaction with an opaque
    error. Check them up front and point the admin at cancellation instead,
    which is the right tool once a class has actually happened.
    """
    if session.attendance.exists():
        raise ValidationError(
            "Занятие с отметками посещаемости нельзя удалить — отмените его")
    if session.payroll_calculations.exists():
        raise ValidationError(
            "Занятие с начисленной зарплатой нельзя удалить — отмените его")
    session_id = session.pk
    label = str(session)
    if actor is not None:
        audit(actor, "session.deleted", session, {"session": session_id, "label": label})
    session.delete()  # cascades the roster: SessionParticipant + WaitlistEntry
    return session_id


def edit_single_session(session: Session, *, actor=None, **changes):
    """Rule 4: edit ONE class of a series without touching the rest.
    Marks the session as manually modified so future series edits skip it."""
    new_trainer = changes.get("substitute_trainer") or changes.get("trainer", session.trainer)
    new_start = changes.get("start_at", session.start_at)
    new_end = changes.get("end_at", session.end_at)
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
