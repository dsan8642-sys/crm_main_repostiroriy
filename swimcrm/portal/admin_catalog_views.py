from .support import *
from .admin_support import _admin_required
from .pagination import (
    choice_param,
    ordered_rows,
    paginated_payload,
    positive_int_param,
    search_param,
)
from django.db.models import Count, OuterRef, Subquery

@require_http_methods(["GET", "POST"])
def admin_groups(request):
    user = _admin_required(request)
    if request.method != "GET":
        group = Group()
        _apply_group_data(group, _json_body(request))
        audit(user, "group.created", group, {"source": "api"})
        return JsonResponse(_group_payload(group), status=201)
    next_sessions = Session.objects.filter(
        group_id=OuterRef("pk"),
        is_cancelled=False,
        start_at__gte=timezone.now(),
    ).order_by("start_at", "id")
    qs = Group.objects.select_related("default_trainer__user").annotate(
        active_participants_count=Count(
            "students",
            filter=Q(students__is_active=True, students__parent__user__is_active=True),
            distinct=True,
        ),
        next_session_start=Subquery(next_sessions.values("start_at")[:1]),
        next_session_location=Subquery(next_sessions.values("location")[:1]),
    )
    active = choice_param(request, "active", {"true", "false"})
    if active:
        qs = qs.filter(is_active=active == "true")
    trainer_id = positive_int_param(request, "trainer_id")
    if trainer_id:
        qs = qs.filter(default_trainer_id=trainer_id)
    q = search_param(request)
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q))
    qs = ordered_rows(request, qs, allowlist={
        "name": ("name", "id"),
        "-name": ("-name", "-id"),
        "id": ("id",),
        "-id": ("-id",),
    }, default="name")
    return JsonResponse(paginated_payload(
        request, qs, key="groups", serializer=_group_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_group_detail(request, group_id):
    user = _admin_required(request)
    group = get_object_or_404(Group.objects.select_related("default_trainer__user"), pk=group_id)
    if request.method == "DELETE":
        group.is_active = False
        group.save(update_fields=["is_active"])
        audit(user, "group.archived", group, {"source": "api"})
        return JsonResponse(_group_payload(group))
    if request.method != "GET":
        _apply_group_data(group, _json_body(request))
        audit(user, "group.updated", group, {"source": "api"})
        return JsonResponse(_group_payload(group))
    return JsonResponse(_group_payload(group))


@require_http_methods(["GET", "POST"])
def admin_subscription_types(request):
    user = _admin_required(request)
    if request.method != "GET":
        subscription_type = SubscriptionType()
        _apply_subscription_type_data(subscription_type, _json_body(request))
        audit(user, "subscription_type.created", subscription_type, {"source": "api"})
        return JsonResponse(_subscription_type_payload(subscription_type), status=201)
    qs = SubscriptionType.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="subscription_types", serializer=_subscription_type_payload))


@require_http_methods(["GET", "POST", "PATCH", "PUT", "DELETE"])
def admin_subscription_type_detail(request, subscription_type_id):
    user = _admin_required(request)
    subscription_type = get_object_or_404(SubscriptionType, pk=subscription_type_id)
    if request.method == "DELETE":
        subscription_type.is_active = False
        subscription_type.save(update_fields=["is_active"])
        audit(user, "subscription_type.archived", subscription_type, {"source": "api"})
        return JsonResponse(_subscription_type_payload(subscription_type))
    if request.method != "GET":
        _apply_subscription_type_data(subscription_type, _json_body(request))
        audit(user, "subscription_type.updated", subscription_type, {"source": "api"})
        return JsonResponse(_subscription_type_payload(subscription_type))
    return JsonResponse(_subscription_type_payload(subscription_type))


