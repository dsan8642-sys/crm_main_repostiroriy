from django.core.exceptions import PermissionDenied, ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from scheduling.models import Session, SessionType
from scheduling.services import split_roster_students
from students.models import ParticipantNote, Student
from students.services import create_participant_note, delete_participant_note, edit_participant_note

from .admin_support import _admin_required
from .support import _json_body, _session_roster, _trainer_from_request
from .trainer_views import _effective_trainer_filter


def _note_payload(note, actor, *, is_admin=False):
    return {
        "id": note.id,
        "body": note.body,
        "author": note.author.get_full_name() or note.author.username if note.author else None,
        "imported": note.imported,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
        "edited": note.edited_at is not None,
        "can_manage": is_admin or note.author_id == actor.id,
    }


def _trainer_participant(request, session_id, participant_id):
    trainer = _trainer_from_request(request)
    session = get_object_or_404(Session.objects.filter(_effective_trainer_filter(trainer)), pk=session_id)
    roster = split_roster_students(session) if session.session_type == SessionType.SPLIT else _session_roster(session)
    student = next((row for row in roster if row.id == participant_id), None)
    if student is None:
        raise PermissionDenied("Участник недоступен в этом занятии.")
    return student, session


def _note_body(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        raise ValidationError({"body": "Передайте объект с текстом заметки."})
    return data.get("body")


def _handle_collection(request, student, *, is_admin=False, read_only=False):
    actor = request.user
    if request.method == "GET":
        notes = ParticipantNote.objects.filter(student=student).select_related("author")
        response = JsonResponse({"notes": [_note_payload(note, actor, is_admin=is_admin) for note in notes]})
    else:
        if read_only or not student.is_active or not student.parent.user.is_active:
            raise PermissionDenied("Нельзя добавить заметку для этого занятия или участника.")
        note = create_participant_note(student, _note_body(request), actor)
        response = JsonResponse(_note_payload(note, actor, is_admin=is_admin), status=201)
    response["Cache-Control"] = "private, no-store"
    return response


def _handle_detail(request, student, note_id, *, is_admin=False, read_only=False):
    actor = request.user
    if read_only or not student.is_active or not student.parent.user.is_active:
        raise PermissionDenied("Нельзя изменить заметку для этого занятия или участника.")
    note = get_object_or_404(ParticipantNote, pk=note_id, student=student)
    if request.method == "PATCH":
        note = edit_participant_note(note, _note_body(request), actor, is_admin=is_admin)
        response = JsonResponse(_note_payload(note, actor, is_admin=is_admin))
    else:
        delete_participant_note(note, actor, is_admin=is_admin)
        response = JsonResponse({"deleted": True})
    response["Cache-Control"] = "private, no-store"
    return response


@require_http_methods(["GET", "POST"])
def admin_participant_notes(request, participant_id):
    _admin_required(request)
    student = get_object_or_404(Student.objects.select_related("parent__user"), pk=participant_id)
    return _handle_collection(request, student, is_admin=True)


@require_http_methods(["PATCH", "DELETE"])
def admin_participant_note_detail(request, participant_id, note_id):
    _admin_required(request)
    student = get_object_or_404(Student.objects.select_related("parent__user"), pk=participant_id)
    return _handle_detail(request, student, note_id, is_admin=True)


@require_http_methods(["GET", "POST"])
def trainer_participant_notes(request, session_id, participant_id):
    student, session = _trainer_participant(request, session_id, participant_id)
    return _handle_collection(request, student, read_only=session.is_cancelled)


@require_http_methods(["PATCH", "DELETE"])
def trainer_participant_note_detail(request, session_id, participant_id, note_id):
    student, session = _trainer_participant(request, session_id, participant_id)
    return _handle_detail(request, student, note_id, read_only=session.is_cancelled)
