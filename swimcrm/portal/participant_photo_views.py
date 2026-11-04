from io import BytesIO
from uuid import uuid4

from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods
from PIL import Image, UnidentifiedImageError

from audit.models import audit
from scheduling.models import Session, SessionType
from students.models import Student

from .admin_support import _admin_required
from .support import _session_roster, _trainer_from_request, split_roster_students


def _photo_response(student):
    if not student.photo:
        return JsonResponse({"error": "Фотография не найдена."}, status=404)
    try:
        photo = student.photo.open("rb")
    except OSError:
        return JsonResponse({"error": "Фотография не найдена."}, status=404)
    response = FileResponse(photo, content_type="image/jpeg")
    response["Content-Disposition"] = "inline"
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_http_methods(["GET", "POST", "DELETE"])
def admin_participant_photo(request, participant_id):
    actor = _admin_required(request)
    student = get_object_or_404(Student, pk=participant_id)
    if request.method == "GET":
        return _photo_response(student)
    old_name = student.photo.name if student.photo else None
    if request.method == "DELETE":
        if old_name:
            storage = student.photo.storage
            with transaction.atomic():
                student.photo = None
                student.photo_updated_at = None
                student.save(update_fields=["photo", "photo_updated_at"])
                audit(actor, "participant.photo_deleted", student, {})
                transaction.on_commit(lambda: storage.delete(old_name))
        return JsonResponse({"has_photo": False, "photo_version": None})

    uploaded = request.FILES.get("photo")
    if uploaded is None or uploaded.size > 1024 * 1024:
        raise ValidationError("Загрузите JPEG не больше 1 МБ.")
    try:
        image = Image.open(uploaded)
        if image.format != "JPEG" or image.size != (512, 512):
            raise ValidationError("Фотография должна быть квадратным JPEG 512×512.")
        image.load()
        output = BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=85)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationError("Не удалось прочитать фотографию JPEG.") from exc
    if output.tell() > 1024 * 1024:
        raise ValidationError("Фотография больше 1 МБ после обработки.")
    storage = student.photo.storage
    new_name = None
    try:
        with transaction.atomic():
            student.photo.save(f"{uuid4().hex}.jpg", ContentFile(output.getvalue()), save=False)
            new_name = student.photo.name
            student.photo_updated_at = timezone.now()
            student.save(update_fields=["photo", "photo_updated_at"])
            audit(actor, "participant.photo_updated", student, {})
            if old_name:
                transaction.on_commit(lambda: storage.delete(old_name))
    except Exception:
        if new_name:
            storage.delete(new_name)
        raise
    return JsonResponse({"has_photo": True, "photo_version": student.photo_updated_at.isoformat()})


@require_GET
def trainer_session_participant_photo(request, session_id, participant_id):
    trainer = _trainer_from_request(request)
    session = get_object_or_404(Session.objects.filter(
        Q(trainer=trainer, substitute_trainer__isnull=True) | Q(substitute_trainer=trainer)
    ), pk=session_id)
    roster = split_roster_students(session) if session.session_type == SessionType.SPLIT else _session_roster(session)
    if participant_id not in {student.id for student in roster}:
        raise PermissionDenied("Участник недоступен в этом занятии.")
    return _photo_response(get_object_or_404(Student, pk=participant_id))
