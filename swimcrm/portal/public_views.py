from .support import *

from .openapi import build_openapi_schema


@require_GET
def openapi_schema(request):
    return JsonResponse(build_openapi_schema())


@require_GET
def me(request):
    user = _require_user(request)
    return JsonResponse({
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "email": user.email,
        "role": "client" if user.role == Role.PARENT else user.role,
        "internal_role": user.role,
        "is_staff": user.is_staff,
        "can_manage_administrators": user.is_superuser,
    })


