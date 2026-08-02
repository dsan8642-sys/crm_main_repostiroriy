from django.core.exceptions import ValidationError
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from localization.models import DictionaryKey, DictionaryTranslation, Language
from notifications.models import NotificationTemplateTranslation
from scheduling.models import Location, SessionType, SessionTypeConfig

from .support import _json_body
from .admin_support import _admin_required
from .pagination import paginated_payload
from .settings_access import require_admin_settings
from .settings_audit import audit_admin_settings
from .settings_serializers import (
    apply_dictionary_key,
    apply_dictionary_translation,
    apply_language,
    apply_location,
    apply_notification_translation,
    apply_session_type,
    dictionary_key_payload,
    dictionary_translation_payload,
    language_payload,
    location_payload,
    notification_translation_payload,
    session_type_payload,
)

def _optional_int_query(request, name):
    raw = request.GET.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{name} must be an integer") from exc
@require_http_methods(["GET", "POST"])
def admin_settings_locations(request):
    require_admin_settings(request)
    if request.method == "POST":
        location = apply_location(Location(), _json_body(request))
        audit_admin_settings(_admin_required(request), location, "created")
        return JsonResponse(location_payload(location), status=201)
    qs = Location.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    if request.GET.get("q"):
        q = request.GET["q"]
        qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q) | Q(address__icontains=q))
    return JsonResponse(paginated_payload(
        request, qs, key="locations", serializer=location_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_location_detail(request, location_id):
    require_admin_settings(request)
    location = get_object_or_404(Location, pk=location_id)
    if request.method == "DELETE":
        location.is_active = False
        location.save(update_fields=["is_active"])
        audit_admin_settings(_admin_required(request), location, "archived", {"is_active": False})
        return JsonResponse(location_payload(location))
    if request.method != "GET":
        apply_location(location, _json_body(request))
        audit_admin_settings(_admin_required(request), location, "updated")
    return JsonResponse(location_payload(location))


SYSTEM_SESSION_TYPE_DEFAULTS = {
    SessionType.GROUP: {
        "label": "Групповое",
        "default_capacity": 10,
        "default_duration_minutes": 60,
    },
    SessionType.INDIVIDUAL: {
        "label": "Индивидуальное",
        "default_capacity": 1,
        "default_duration_minutes": 60,
    },
    SessionType.SPLIT: {
        "label": "Сплит",
        "default_capacity": 2,
        "default_duration_minutes": 60,
    },
}


@require_GET
def admin_settings_session_types(request):
    require_admin_settings(request)
    configured = {
        row.code: row
        for row in SessionTypeConfig.objects.filter(
            code__in=SYSTEM_SESSION_TYPE_DEFAULTS).order_by("code", "id")
    }
    rows = []
    for code, defaults in SYSTEM_SESSION_TYPE_DEFAULTS.items():
        row = configured.get(code)
        if row:
            rows.append({**session_type_payload(row), "configured": True})
        else:
            rows.append({
                "id": None,
                "code": code,
                "label": defaults["label"],
                "default_capacity": defaults["default_capacity"],
                "default_price_minor": None,
                "default_currency": "PLN",
                "default_duration_minutes": defaults["default_duration_minutes"],
                "color_key": None,
                "is_active": False,
                "configured": False,
                "repair_available": code == SessionType.SPLIT,
            })
    return JsonResponse({"session_types": rows})


@require_POST
def admin_settings_restore_split(request):
    require_admin_settings(request)
    actor = _admin_required(request)
    defaults = {
        **SYSTEM_SESSION_TYPE_DEFAULTS[SessionType.SPLIT],
        "default_price_minor": None,
        "default_currency": "PLN",
        "is_active": True,
    }
    session_type, created = SessionTypeConfig.objects.get_or_create(
        code=SessionType.SPLIT,
        defaults=defaults,
    )
    changed = []
    if not session_type.is_active:
        session_type.is_active = True
        session_type.save(update_fields=["is_active", "updated_at"])
        changed.append("is_active")
    audit_admin_settings(actor, session_type, "system_type_restored", {
        "code": SessionType.SPLIT,
        "created": created,
        "changed_fields": changed,
        "idempotent_replay": not created and not changed,
    })
    return JsonResponse(
        {**session_type_payload(session_type), "configured": True, "created": created},
        status=201 if created else 200,
    )


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_session_type_detail(request, session_type_id):
    require_admin_settings(request)
    session_type = get_object_or_404(SessionTypeConfig, pk=session_type_id)
    if request.method == "DELETE":
        session_type.is_active = False
        session_type.save(update_fields=["is_active"])
        audit_admin_settings(_admin_required(request), session_type, "archived", {"is_active": False})
        return JsonResponse(session_type_payload(session_type))
    if request.method != "GET":
        apply_session_type(session_type, _json_body(request))
        audit_admin_settings(_admin_required(request), session_type, "updated")
    return JsonResponse(session_type_payload(session_type))


@require_http_methods(["GET", "POST"])
def admin_settings_languages(request):
    require_admin_settings(request)
    if request.method == "POST":
        language = apply_language(Language(), _json_body(request))
        audit_admin_settings(_admin_required(request), language, "created")
        return JsonResponse(language_payload(language), status=201)
    qs = Language.objects.order_by("code", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="languages", serializer=language_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_language_detail(request, language_id):
    require_admin_settings(request)
    language = get_object_or_404(Language, pk=language_id)
    if request.method == "DELETE":
        language.is_active = False
        language.save(update_fields=["is_active"])
        audit_admin_settings(_admin_required(request), language, "archived", {"is_active": False})
        return JsonResponse(language_payload(language))
    if request.method != "GET":
        apply_language(language, _json_body(request))
        audit_admin_settings(_admin_required(request), language, "updated")
    return JsonResponse(language_payload(language))


@require_http_methods(["GET", "POST"])
def admin_settings_dictionary_keys(request):
    require_admin_settings(request)
    if request.method == "POST":
        key = apply_dictionary_key(DictionaryKey(), _json_body(request))
        audit_admin_settings(_admin_required(request), key, "created")
        return JsonResponse(dictionary_key_payload(key), status=201)
    qs = DictionaryKey.objects.order_by("domain", "code", "id")
    if request.GET.get("domain"):
        qs = qs.filter(domain=request.GET["domain"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse(paginated_payload(
        request, qs, key="keys", serializer=dictionary_key_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_dictionary_key_detail(request, key_id):
    require_admin_settings(request)
    key = get_object_or_404(DictionaryKey, pk=key_id)
    if request.method == "DELETE":
        key.is_active = False
        key.save(update_fields=["is_active"])
        audit_admin_settings(_admin_required(request), key, "archived", {"is_active": False})
        return JsonResponse(dictionary_key_payload(key))
    if request.method != "GET":
        apply_dictionary_key(key, _json_body(request))
        audit_admin_settings(_admin_required(request), key, "updated")
    return JsonResponse(dictionary_key_payload(key))


@require_http_methods(["GET", "POST"])
def admin_settings_dictionary_translations(request):
    require_admin_settings(request)
    if request.method == "POST":
        translation = apply_dictionary_translation(DictionaryTranslation(), _json_body(request))
        audit_admin_settings(_admin_required(request), translation, "created")
        return JsonResponse(dictionary_translation_payload(translation), status=201)
    qs = DictionaryTranslation.objects.select_related("key").order_by("key__domain", "key__code", "language_code", "id")
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    if request.GET.get("domain"):
        qs = qs.filter(key__domain=request.GET["domain"])
    return JsonResponse(paginated_payload(
        request, qs, key="translations", serializer=dictionary_translation_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_dictionary_translation_detail(request, translation_id):
    require_admin_settings(request)
    translation = get_object_or_404(DictionaryTranslation.objects.select_related("key"), pk=translation_id)
    if request.method == "DELETE":
        audit_admin_settings(_admin_required(request), translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        apply_dictionary_translation(translation, _json_body(request))
        audit_admin_settings(_admin_required(request), translation, "updated")
    return JsonResponse(dictionary_translation_payload(translation))


@require_http_methods(["GET", "POST"])
def admin_settings_notification_template_translations(request):
    require_admin_settings(request)
    if request.method == "POST":
        translation = apply_notification_translation(
            NotificationTemplateTranslation(), _json_body(request))
        audit_admin_settings(_admin_required(request), translation, "created")
        return JsonResponse(notification_translation_payload(translation), status=201)
    qs = NotificationTemplateTranslation.objects.select_related("template").order_by(
        "template__event_type", "template__channel", "language_code", "id")
    template_id = _optional_int_query(request, "template_id")
    if template_id is not None:
        qs = qs.filter(template_id=template_id)
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    return JsonResponse(paginated_payload(
        request, qs, key="translations",
        serializer=notification_translation_payload))


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_notification_template_translation_detail(request, translation_id):
    require_admin_settings(request)
    translation = get_object_or_404(
        NotificationTemplateTranslation.objects.select_related("template"), pk=translation_id)
    if request.method == "DELETE":
        audit_admin_settings(_admin_required(request), translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        apply_notification_translation(translation, _json_body(request))
        audit_admin_settings(_admin_required(request), translation, "updated")
    return JsonResponse(notification_translation_payload(translation))


__all__ = [
    "admin_settings_locations", "admin_settings_location_detail",
    "admin_settings_session_types", "admin_settings_session_type_detail",
    "admin_settings_restore_split",
    "admin_settings_languages", "admin_settings_language_detail",
    "admin_settings_dictionary_keys", "admin_settings_dictionary_key_detail",
    "admin_settings_dictionary_translations", "admin_settings_dictionary_translation_detail",
    "admin_settings_notification_template_translations",
    "admin_settings_notification_template_translation_detail",
]
