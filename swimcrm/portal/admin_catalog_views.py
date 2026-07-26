from .support import *
from .admin_support import _admin_required
from .pagination import paginated_payload

@require_http_methods(["GET", "POST"])
def admin_groups(request):
    user = _admin_required(request)
    if request.method != "GET":
        group = Group()
        _apply_group_data(group, _json_body(request))
        audit(user, "group.created", group, {"source": "api"})
        return JsonResponse(_group_payload(group), status=201)
    qs = Group.objects.select_related("default_trainer__user").order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q))
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


