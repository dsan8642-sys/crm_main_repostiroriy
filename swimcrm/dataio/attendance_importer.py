"""Import historical attendance from .xlsx/.csv.

Column headers mirror the attendance export (dataio.exports.attendance_dataset)
plus extra columns used only when a matching Session does not exist yet:

    Дата       — session start, "ДД.ММ.ГГГГ ЧЧ:ММ"
    Клиент     — email, or "Фамилия Имя"
    Группа     — group name (leave blank for an individual session)
    Тренер     — trainer full name or username
    Статус     — present/absent/excused/rescheduled, or their Russian labels
    Окончание  — end time "ЧЧ:ММ" on the same date (only needed to create a session)
    Локация    — session location (only needed to create a session)
    Вместимость— max_participants (only needed to create a session)

AttendanceRecord is immutable (delete() raises ValidationError, see
attendance.models), so there is no rollback for a committed import — preview
is the only safety net.
"""
from dataclasses import dataclass, field
from datetime import datetime

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounts.models import Trainer
from attendance.models import AttendanceRecord, AttendanceStatus
from attendance.services import set_attendance
from catalog.models import Group
from scheduling.models import (Session, SessionParticipant,
                               SessionParticipantSource, SessionParticipantStatus,
                               SessionType)
from scheduling.services import ScheduleConflict, create_session, session_roster_students
from students.models import Student

MATCHED, WILL_CREATE_SESSION, DUPLICATE, ERROR = (
    "matched", "will_create_session", "duplicate", "error")

STATUS_VALUES = {v.lower(): v for v in AttendanceStatus.values}
STATUS_LABELS = {label.lower(): value for value, label in AttendanceStatus.choices}


@dataclass
class AttendancePreviewRow:
    index: int
    data: dict
    status: str = ERROR
    errors: list = field(default_factory=list)
    resolved: dict = field(default_factory=dict)


def _resolve_student(raw):
    raw = (raw or "").strip()
    if not raw:
        return None, "Не указан клиент"
    if "@" in raw:
        student = Student.objects.select_related("parent__user").filter(email__iexact=raw).first()
        return (student, None) if student else (None, f"Клиент не найден: {raw}")
    parts = raw.split(maxsplit=1)
    last, first = (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")
    qs = Student.objects.select_related("parent__user").filter(
        last_name__iexact=last, first_name__iexact=first)
    count = qs.count()
    if count == 0:
        return None, f"Клиент не найден: {raw}"
    if count > 1:
        return None, f"Клиент неоднозначен, уточните email: {raw}"
    return qs.first(), None


def _parse_status(raw):
    key = (raw or "").strip().lower()
    if key in STATUS_VALUES:
        return STATUS_VALUES[key]
    if key in STATUS_LABELS:
        return STATUS_LABELS[key]
    return None


def _parse_start_at(raw):
    try:
        naive = datetime.strptime((raw or "").strip(), "%d.%m.%Y %H:%M")
    except ValueError:
        return None
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive


def _parse_end_at(start_at, raw):
    raw = (raw or "").strip()
    if not raw or start_at is None:
        return None
    try:
        hh, mm = raw.split(":")
        return start_at.replace(hour=int(hh), minute=int(mm))
    except (ValueError, TypeError):
        return None


def _parse_iso(value):
    parsed = datetime.fromisoformat(value)
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


def _build_lookups():
    trainers_by_key = {}
    for t in Trainer.objects.select_related("user"):
        trainers_by_key[t.user.get_username().lower()] = t
        full = t.user.get_full_name().strip().lower()
        if full:
            trainers_by_key[full] = t
    groups_by_name = {g.name.lower(): g for g in Group.objects.all()}
    return trainers_by_key, groups_by_name


def preview(headers, rows):
    """Classify each row: matched (session exists) / will_create_session /
    duplicate (attendance already recorded) / error. No DB writes."""
    trainers_by_key, groups_by_name = _build_lookups()
    result = []
    for i, row in enumerate(rows, start=2):  # row 1 = header
        d = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        pr = AttendancePreviewRow(index=i, data=d)

        student, err = _resolve_student(d.get("Клиент"))
        if err:
            pr.errors.append(err)

        status_value = _parse_status(d.get("Статус"))
        if status_value is None:
            pr.errors.append(f"Некорректный статус: {d.get('Статус', '')}")

        start_at = _parse_start_at(d.get("Дата"))
        if start_at is None:
            pr.errors.append("Некорректная дата (ожидается ДД.ММ.ГГГГ ЧЧ:ММ)")

        gname = d.get("Группа", "").strip()
        tname = d.get("Тренер", "").strip()
        group = groups_by_name.get(gname.lower()) if gname else None
        if gname and group is None:
            pr.errors.append(f"Группа не найдена: {gname}")
        trainer = trainers_by_key.get(tname.lower()) if tname else None
        if tname and trainer is None:
            pr.errors.append(f"Тренер не найден: {tname}")
        if not gname and not tname:
            pr.errors.append("Укажите группу или тренера")

        if pr.errors:
            pr.status = ERROR
            result.append(pr)
            continue

        session = None
        # Group and individual sessions are mutually exclusive (DB constraint
        # session_group_xor_individual), so match on whichever the row specifies
        # rather than falling back to "any session this trainer has at this
        # time" — that could silently attach to an unrelated individual session.
        if group is not None:
            session = Session.objects.filter(
                group=group, start_at=start_at, is_cancelled=False).first()
        elif trainer is not None:
            session = Session.objects.filter(
                trainer=trainer, start_at=start_at, is_cancelled=False,
                individual_student=student).first()

        if session is not None:
            if AttendanceRecord.objects.filter(session=session, student=student).exists():
                pr.status = DUPLICATE
                pr.errors.append("Отметка о посещении уже есть")
                result.append(pr)
                continue
            pr.status = MATCHED
            pr.resolved = {"student_id": student.id, "session_id": session.id,
                           "status": status_value}
            result.append(pr)
            continue

        # No matching session — plan to create one.
        end_at = _parse_end_at(start_at, d.get("Окончание"))
        location = d.get("Локация", "").strip()
        capacity_raw = d.get("Вместимость", "").strip()
        row_errors = []
        if trainer is None:
            row_errors.append("Для создания занятия нужен тренер")
        if end_at is None:
            row_errors.append("Некорректное время окончания (ожидается ЧЧ:ММ)")
        if not location:
            row_errors.append("Для создания занятия нужна локация")
        capacity = None
        if not capacity_raw:
            row_errors.append("Для создания занятия нужна вместимость")
        else:
            try:
                capacity = int(capacity_raw)
                if capacity <= 0:
                    raise ValueError
            except ValueError:
                row_errors.append("Вместимость должна быть положительным числом")

        if row_errors:
            pr.status = ERROR
            pr.errors.extend(row_errors)
            result.append(pr)
            continue

        pr.status = WILL_CREATE_SESSION
        pr.resolved = {
            "student_id": student.id,
            "group_id": group.id if group else None,
            "trainer_id": trainer.id,
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
            "location": location,
            "max_participants": capacity,
            "status": status_value,
        }
        result.append(pr)
    return result


def _ensure_roster(session, student, actor):
    """Attach `student` to the session if not already covered by the base roster."""
    roster_ids = set(session_roster_students(session).values_list("id", flat=True))
    if student.id in roster_ids:
        return
    if len(roster_ids) >= session.max_participants:
        raise ValidationError(f"Превышен лимит участников занятия ({session.max_participants})")
    participant = SessionParticipant(
        session=session, student=student,
        source=SessionParticipantSource.MANUAL, status=SessionParticipantStatus.ACTIVE)
    participant.full_clean()
    participant.save()


@transaction.atomic
def commit(preview_rows, *, actor=None):
    """Apply matched/will_create_session rows. Everything else is skipped.
    No rollback: AttendanceRecord history is immutable by design."""
    created_sessions = created_records = skipped = 0
    errors = []

    for pr in preview_rows:
        if pr.status not in (MATCHED, WILL_CREATE_SESSION):
            skipped += 1
            continue
        try:
            with transaction.atomic():
                r = pr.resolved
                student = Student.objects.select_related("parent__user").get(pk=r["student_id"])

                if pr.status == WILL_CREATE_SESSION:
                    trainer = Trainer.objects.select_related("user").get(pk=r["trainer_id"])
                    group = Group.objects.get(pk=r["group_id"]) if r.get("group_id") else None
                    start_at = _parse_iso(r["start_at"])
                    end_at = _parse_iso(r["end_at"])
                    # Re-check: another row (or a concurrent import) may have
                    # created a matching session since preview ran. Same
                    # exclusive group-vs-individual matching as preview().
                    session = None
                    if group is not None:
                        session = Session.objects.filter(
                            group=group, start_at=start_at, is_cancelled=False).first()
                    else:
                        session = Session.objects.filter(
                            trainer=trainer, start_at=start_at, is_cancelled=False,
                            individual_student=student).first()
                    if session is None:
                        session = create_session(
                            trainer=trainer, start_at=start_at, end_at=end_at,
                            location=r["location"], max_participants=r["max_participants"],
                            group=group, session_type=(SessionType.GROUP if group else SessionType.INDIVIDUAL),
                            individual_student=(None if group else student), actor=actor)
                        created_sessions += 1
                else:
                    session = Session.objects.select_for_update().get(pk=r["session_id"])

                if AttendanceRecord.objects.filter(session=session, student=student).exists():
                    skipped += 1
                    continue
                _ensure_roster(session, student, actor)
                set_attendance(session_id=session.id, student=student, status=r["status"], actor=actor)
                created_records += 1
        except (ValidationError, ScheduleConflict) as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            errors.append(f"Строка {pr.index}: {message}")
            skipped += 1

    return {
        "created_sessions": created_sessions,
        "created_records": created_records,
        "skipped": skipped,
        "errors": errors,
    }
