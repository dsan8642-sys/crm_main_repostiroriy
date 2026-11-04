import json
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from django.http import HttpResponse, JsonResponse

from .support import *
from .admin_support import _admin_required


@require_GET
def admin_export_client_data(request, client_id):
    _admin_required(request)
    account = get_object_or_404(ParentAccount.objects.select_related("user"), pk=client_id)
    payload = _client_detail_payload(account)
    payload["internal_notes"] = list(ParticipantNote.objects.filter(student__parent=account).values(
        "student_id", "body", "created_at", "updated_at", "imported"))
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("client-data.json", json.dumps(payload, ensure_ascii=False, indent=2, default=str))
        for student in account.students.all():
            if student.photo:
                with student.photo.open("rb") as photo:
                    archive.writestr(f"photos/participant-{student.id}.jpg", photo.read())
    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="client-{client_id}-data.zip"'
    return response


@require_POST
def admin_anonymize_client(request, client_id):
    user = _admin_required(request)
    account = get_object_or_404(ParentAccount, pk=client_id)
    anonymize_parent_account(account, actor=user)
    return JsonResponse({"status": "anonymized", "client_id": client_id})
