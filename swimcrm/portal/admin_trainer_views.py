from .support import *
from .admin_support import _admin_required
from .pagination import (
    choice_param,
    ordered_rows,
    paginated_payload,
    search_param,
)
from django.db.models import Count, Q

@require_http_methods(["GET", "POST"])
def admin_trainers(request):
    user = _admin_required(request)
    if request.method != "GET":
        data = _json_body(request)
        data["_actor"] = user
        trainer = _create_trainer(data)
        return JsonResponse(_trainer_payload(trainer), status=201)
    qs = Trainer.objects.select_related("user").annotate(
        active_groups_count=Count(
            "default_groups",
            filter=Q(default_groups__is_active=True),
            distinct=True,
        ),
    )
    active = choice_param(request, "active", {"true", "false"})
    if active:
        qs = qs.filter(is_active=active == "true")
    q = search_param(request)
    if q:
        qs = qs.filter(
            Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q) |
            Q(user__username__icontains=q) | Q(user__email__icontains=q) |
            Q(phone__icontains=q)
        )
    qs = ordered_rows(request, qs, allowlist={
        "name": ("user__last_name", "user__first_name", "id"),
        "-name": ("-user__last_name", "-user__first_name", "-id"),
        "id": ("id",),
        "-id": ("-id",),
    }, default="name")
    return JsonResponse(paginated_payload(
        request, qs, key="trainers", serializer=_trainer_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_trainer_detail(request, trainer_id):
    user = _admin_required(request)
    trainer = get_object_or_404(Trainer.objects.select_related("user"), pk=trainer_id)
    if request.method == "DELETE":
        with transaction.atomic():
            trainer.is_active = False
            trainer.user.is_active = False
            trainer.user.save(update_fields=["is_active"])
            trainer.save(update_fields=["is_active"])
            invalidated = _invalidate_access_codes(trainer.user)
            audit(user, "trainer.archived", trainer, {
                "source": "api",
                "invalidated_codes": invalidated,
            })
        return JsonResponse(_trainer_payload(trainer))
    if request.method != "GET":
        _apply_trainer_data(trainer, _json_body(request))
        audit(user, "trainer.updated", trainer, {"source": "api"})
        return JsonResponse(_trainer_payload(trainer))
    return JsonResponse(_trainer_payload(trainer))


