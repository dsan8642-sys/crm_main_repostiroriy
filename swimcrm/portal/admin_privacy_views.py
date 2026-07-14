import json

from django.http import HttpResponse, JsonResponse

from .support import *
from .admin_support import _admin_required


@require_GET
def admin_export_client_data(request, client_id):
    _admin_required(request)
    account = get_object_or_404(ParentAccount.objects.select_related("user"), pk=client_id)
    payload = _client_detail_payload(account)
    content = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    response = HttpResponse(content, content_type="application/json; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="client-{client_id}-data.json"'
    return response


@require_POST
def admin_anonymize_client(request, client_id):
    user = _admin_required(request)
    account = get_object_or_404(ParentAccount, pk=client_id)
    anonymize_parent_account(account, actor=user)
    return JsonResponse({"status": "anonymized", "client_id": client_id})
