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
            trainer = Trainer.objects.select_for_update().select_related("user").get(pk=trainer.pk)
            changed = trainer.is_active or trainer.user.is_active
            future_sessions_count = Session.objects.filter(
                Q(trainer=trainer) | Q(substitute_trainer=trainer),
                is_cancelled=False,
                start_at__gte=timezone.now(),
            ).distinct().count()
            cleared_group_ids = list(Group.objects.filter(
                default_trainer=trainer,
                is_active=True,
            ).values_list("id", flat=True))
            invalidated = 0
            if changed:
                trainer.is_active = False
                trainer.user.is_active = False
                trainer.user.save(update_fields=["is_active"])
                trainer.save(update_fields=["is_active"])
                invalidated = _invalidate_access_codes(trainer.user)
                Group.objects.filter(id__in=cleared_group_ids).update(default_trainer=None)
                audit(user, "trainer.archived", trainer, {
                    "source": "api",
                    "invalidated_codes": invalidated,
                    "cleared_default_group_ids": cleared_group_ids,
                    "future_sessions_count": future_sessions_count,
                })
        return JsonResponse({
            **_trainer_payload(trainer),
            "changed": changed,
            "future_sessions_count": future_sessions_count,
            "cleared_default_groups_count": len(cleared_group_ids) if changed else 0,
            "cleared_default_group_ids": cleared_group_ids if changed else [],
            "invalidated_codes": invalidated,
        })
    if request.method != "GET":
        _apply_trainer_data(trainer, _json_body(request))
        audit(user, "trainer.updated", trainer, {"source": "api"})
        return JsonResponse(_trainer_payload(trainer))
    return JsonResponse({
        **_trainer_payload(trainer),
        "future_sessions_count": Session.objects.filter(
            Q(trainer=trainer) | Q(substitute_trainer=trainer),
            is_cancelled=False,
            start_at__gte=timezone.now(),
        ).distinct().count(),
        "default_groups_count": trainer.default_groups.filter(is_active=True).count(),
    })


@require_POST
def admin_trainer_restore(request, trainer_id):
    user = _admin_required(request)
    with transaction.atomic():
        trainer = get_object_or_404(
            Trainer.objects.select_for_update().select_related("user"), pk=trainer_id)
        changed = not trainer.is_active or not trainer.user.is_active
        if changed:
            trainer.is_active = True
            trainer.user.is_active = True
            trainer.user.save(update_fields=["is_active"])
            trainer.save(update_fields=["is_active"])
            audit(user, "trainer.restored", trainer, {"source": "api"})
    return JsonResponse({**_trainer_payload(trainer), "changed": changed})


