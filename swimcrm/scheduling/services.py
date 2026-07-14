"""Rule 4 & 5: session generation from templates, series edits, conflict control."""
from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from audit.models import audit

from .models import RecurringTemplate, Session, SessionType


class ScheduleConflict(ValidationError):
    """Raised when creating/generating a session would violate rule 5."""


def _overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def check_trainer_conflict(trainer, start_at, end_at, exclude_session_id=None):
    """Rule 5: a trainer cannot be in two places at the same time."""
    qs = Session.objects.filter(trainer=trainer, is_cancelled=False)
    if exclude_session_id:
        qs = qs.exclude(pk=exclude_session_id)
    # narrow by day window to keep the scan small, then check exact overlap
    qs = qs.filter(start_at__lt=end_at, end_at__gt=start_at)
    if qs.exists():
        raise ScheduleConflict(
            f"Конфликт: тренер уже занят в интервале "
            f"{timezone.localtime(start_at):%d.%m %H:%M}–{timezone.localtime(end_at):%H:%M}")


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


def edit_single_session(session: Session, *, actor=None, **changes):
    """Rule 4: edit ONE class of a series without touching the rest.
    Marks the session as manually modified so future series edits skip it."""
    new_trainer = changes.get("trainer", session.trainer)
    new_start = changes.get("start_at", session.start_at)
    new_end = changes.get("end_at", session.end_at)
    check_trainer_conflict(new_trainer, new_start, new_end, exclude_session_id=session.pk)
    for field, value in changes.items():
        setattr(session, field, value)
    session.is_manually_modified = True
    session.full_clean(exclude=["template", "group", "individual_student"])
    session.save()
    if actor is not None:
        audit(actor, "session.edited", session, {"fields": list(changes.keys())})
    return session
