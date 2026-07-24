from django.db.models import Q

from localization.models import DictionaryKey, DictionaryTranslation, Language
from notifications.models import NotificationTemplate, NotificationTemplateTranslation
from scheduling.models import Location, SessionTypeConfig

from .support import *
from .admin_support import _admin_required


def _admin_settings_required(request):
    # Low-risk configuration edited from the SwimCRM admin UI.
    # A signed-in administrator (or superuser) is required; no bridge token exists.
    _admin_required(request)


def _audit_admin_settings(instance, operation, changes=None):
    model_name = type(instance).__name__
    audit(
        None,
        f"admin_settings.{model_name}.{operation}",
        instance,
        {"source": "admin_settings_api", **(changes or {})},
    )


def _optional_int_query(request, name):
    raw = request.GET.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{name} must be an integer") from exc


def _location_config_payload(location):
    return {
        "id": location.id,
        "code": location.code,
        "name": location.name,
        "address": location.address,
        "timezone": location.timezone,
        "is_active": location.is_active,
        "created_at": timezone.localtime(location.created_at).isoformat() if location.created_at else None,
        "updated_at": timezone.localtime(location.updated_at).isoformat() if location.updated_at else None,
    }


def _apply_location_config(location, data):
    data = data.get("location") or data
    if "code" in data:
        location.code = data.get("code", "") or ""
    if "name" in data:
        location.name = data.get("name", "") or ""
    if "address" in data:
        location.address = data.get("address", "") or ""
    if "timezone" in data:
        location.timezone = data.get("timezone", "") or "Europe/Warsaw"
    if "is_active" in data:
        location.is_active = _bool_value(data.get("is_active"), True)
    location.full_clean()
    location.save()
    return location


def _session_type_config_payload(session_type):
    return {
        "id": session_type.id,
        "code": session_type.code,
        "label": session_type.label,
        "default_capacity": session_type.default_capacity,
        "is_active": session_type.is_active,
        "created_at": timezone.localtime(session_type.created_at).isoformat() if session_type.created_at else None,
        "updated_at": timezone.localtime(session_type.updated_at).isoformat() if session_type.updated_at else None,
    }


def _apply_session_type_config(session_type, data):
    data = data.get("session_type") or data
    if "code" in data:
        session_type.code = data.get("code", "") or ""
    if "label" in data:
        session_type.label = data.get("label", "") or ""
    if "default_capacity" in data:
        value = data.get("default_capacity")
        session_type.default_capacity = None if value in (None, "") else int(value)
    if "is_active" in data:
        session_type.is_active = _bool_value(data.get("is_active"), True)
    session_type.full_clean()
    session_type.save()
    return session_type


def _language_config_payload(language):
    return {
        "id": language.id,
        "code": language.code,
        "name": language.name,
        "is_active": language.is_active,
    }


def _apply_language_config(language, data):
    data = data.get("language") or data
    if "code" in data:
        language.code = data.get("code", "") or ""
    if "name" in data:
        language.name = data.get("name", "") or ""
    if "is_active" in data:
        language.is_active = _bool_value(data.get("is_active"), True)
    language.full_clean()
    language.save()
    return language


def _dictionary_key_config_payload(key):
    return {
        "id": key.id,
        "domain": key.domain,
        "code": key.code,
        "is_active": key.is_active,
    }


def _apply_dictionary_key_config(key, data):
    data = data.get("key") or data
    if "domain" in data:
        key.domain = data.get("domain", "") or ""
    if "code" in data:
        key.code = data.get("code", "") or ""
    if "is_active" in data:
        key.is_active = _bool_value(data.get("is_active"), True)
    key.full_clean()
    key.save()
    return key


def _dictionary_translation_config_payload(translation):
    return {
        "id": translation.id,
        "key_id": translation.key_id,
        "domain": translation.key.domain,
        "code": translation.key.code,
        "language_code": translation.language_code,
        "value": translation.value,
        "created_at": timezone.localtime(translation.created_at).isoformat() if translation.created_at else None,
        "updated_at": timezone.localtime(translation.updated_at).isoformat() if translation.updated_at else None,
    }


def _apply_dictionary_translation_config(translation, data):
    data = data.get("translation") or data
    if "key_id" in data:
        translation.key = get_object_or_404(DictionaryKey, pk=data.get("key_id"))
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "value" in data:
        translation.value = data.get("value", "") or ""
    translation.full_clean()
    translation.save()
    return translation


def _notification_template_translation_config_payload(translation):
    return {
        "id": translation.id,
        "template_id": translation.template_id,
        "event_type": translation.template.event_type,
        "channel": translation.template.channel,
        "language_code": translation.language_code,
        "subject": translation.subject,
        "body": translation.body,
        "created_at": timezone.localtime(translation.created_at).isoformat() if translation.created_at else None,
        "updated_at": timezone.localtime(translation.updated_at).isoformat() if translation.updated_at else None,
    }


def _apply_notification_template_translation_config(translation, data):
    data = data.get("translation") or data
    if "template_id" in data:
        translation.template = get_object_or_404(NotificationTemplate, pk=data.get("template_id"))
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "subject" in data:
        translation.subject = data.get("subject", "") or ""
    if "body" in data:
        translation.body = data.get("body", "") or ""
    translation.full_clean()
    translation.save()
    return translation


@require_http_methods(["GET", "POST"])
def admin_settings_locations(request):
    _admin_settings_required(request)
    if request.method == "POST":
        location = _apply_location_config(Location(), _json_body(request))
        _audit_admin_settings(location, "created")
        return JsonResponse(_location_config_payload(location), status=201)
    qs = Location.objects.order_by("name", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    if request.GET.get("q"):
        q = request.GET["q"]
        qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q) | Q(address__icontains=q))
    return JsonResponse({"locations": [_location_config_payload(location) for location in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_location_detail(request, location_id):
    _admin_settings_required(request)
    location = get_object_or_404(Location, pk=location_id)
    if request.method == "DELETE":
        location.is_active = False
        location.save(update_fields=["is_active"])
        _audit_admin_settings(location, "archived", {"is_active": False})
        return JsonResponse(_location_config_payload(location))
    if request.method != "GET":
        _apply_location_config(location, _json_body(request))
        _audit_admin_settings(location, "updated")
    return JsonResponse(_location_config_payload(location))


@require_http_methods(["GET", "POST"])
def admin_settings_session_types(request):
    _admin_settings_required(request)
    if request.method == "POST":
        session_type = _apply_session_type_config(SessionTypeConfig(), _json_body(request))
        _audit_admin_settings(session_type, "created")
        return JsonResponse(_session_type_config_payload(session_type), status=201)
    qs = SessionTypeConfig.objects.order_by("code", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"session_types": [_session_type_config_payload(row) for row in qs[:50]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_session_type_detail(request, session_type_id):
    _admin_settings_required(request)
    session_type = get_object_or_404(SessionTypeConfig, pk=session_type_id)
    if request.method == "DELETE":
        session_type.is_active = False
        session_type.save(update_fields=["is_active"])
        _audit_admin_settings(session_type, "archived", {"is_active": False})
        return JsonResponse(_session_type_config_payload(session_type))
    if request.method != "GET":
        _apply_session_type_config(session_type, _json_body(request))
        _audit_admin_settings(session_type, "updated")
    return JsonResponse(_session_type_config_payload(session_type))


@require_http_methods(["GET", "POST"])
def admin_settings_languages(request):
    _admin_settings_required(request)
    if request.method == "POST":
        language = _apply_language_config(Language(), _json_body(request))
        _audit_admin_settings(language, "created")
        return JsonResponse(_language_config_payload(language), status=201)
    qs = Language.objects.order_by("code", "id")
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"languages": [_language_config_payload(language) for language in qs[:200]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_language_detail(request, language_id):
    _admin_settings_required(request)
    language = get_object_or_404(Language, pk=language_id)
    if request.method == "DELETE":
        language.is_active = False
        language.save(update_fields=["is_active"])
        _audit_admin_settings(language, "archived", {"is_active": False})
        return JsonResponse(_language_config_payload(language))
    if request.method != "GET":
        _apply_language_config(language, _json_body(request))
        _audit_admin_settings(language, "updated")
    return JsonResponse(_language_config_payload(language))


@require_http_methods(["GET", "POST"])
def admin_settings_dictionary_keys(request):
    _admin_settings_required(request)
    if request.method == "POST":
        key = _apply_dictionary_key_config(DictionaryKey(), _json_body(request))
        _audit_admin_settings(key, "created")
        return JsonResponse(_dictionary_key_config_payload(key), status=201)
    qs = DictionaryKey.objects.order_by("domain", "code", "id")
    if request.GET.get("domain"):
        qs = qs.filter(domain=request.GET["domain"])
    if request.GET.get("active") in {"true", "false"}:
        qs = qs.filter(is_active=request.GET["active"] == "true")
    return JsonResponse({"keys": [_dictionary_key_config_payload(key) for key in qs[:500]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_dictionary_key_detail(request, key_id):
    _admin_settings_required(request)
    key = get_object_or_404(DictionaryKey, pk=key_id)
    if request.method == "DELETE":
        key.is_active = False
        key.save(update_fields=["is_active"])
        _audit_admin_settings(key, "archived", {"is_active": False})
        return JsonResponse(_dictionary_key_config_payload(key))
    if request.method != "GET":
        _apply_dictionary_key_config(key, _json_body(request))
        _audit_admin_settings(key, "updated")
    return JsonResponse(_dictionary_key_config_payload(key))


@require_http_methods(["GET", "POST"])
def admin_settings_dictionary_translations(request):
    _admin_settings_required(request)
    if request.method == "POST":
        translation = _apply_dictionary_translation_config(DictionaryTranslation(), _json_body(request))
        _audit_admin_settings(translation, "created")
        return JsonResponse(_dictionary_translation_config_payload(translation), status=201)
    qs = DictionaryTranslation.objects.select_related("key").order_by("key__domain", "key__code", "language_code", "id")
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    if request.GET.get("domain"):
        qs = qs.filter(key__domain=request.GET["domain"])
    return JsonResponse({"translations": [_dictionary_translation_config_payload(row) for row in qs[:500]]})


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_dictionary_translation_detail(request, translation_id):
    _admin_settings_required(request)
    translation = get_object_or_404(DictionaryTranslation.objects.select_related("key"), pk=translation_id)
    if request.method == "DELETE":
        _audit_admin_settings(translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        _apply_dictionary_translation_config(translation, _json_body(request))
        _audit_admin_settings(translation, "updated")
    return JsonResponse(_dictionary_translation_config_payload(translation))


@require_http_methods(["GET", "POST"])
def admin_settings_notification_template_translations(request):
    _admin_settings_required(request)
    if request.method == "POST":
        translation = _apply_notification_template_translation_config(
            NotificationTemplateTranslation(), _json_body(request))
        _audit_admin_settings(translation, "created")
        return JsonResponse(_notification_template_translation_config_payload(translation), status=201)
    qs = NotificationTemplateTranslation.objects.select_related("template").order_by(
        "template__event_type", "template__channel", "language_code", "id")
    template_id = _optional_int_query(request, "template_id")
    if template_id is not None:
        qs = qs.filter(template_id=template_id)
    if request.GET.get("language_code"):
        qs = qs.filter(language_code=request.GET["language_code"].lower())
    return JsonResponse({
        "translations": [_notification_template_translation_config_payload(row) for row in qs[:500]],
    })


@require_http_methods(["GET", "PATCH", "PUT", "DELETE"])
def admin_settings_notification_template_translation_detail(request, translation_id):
    _admin_settings_required(request)
    translation = get_object_or_404(
        NotificationTemplateTranslation.objects.select_related("template"), pk=translation_id)
    if request.method == "DELETE":
        _audit_admin_settings(translation, "deleted")
        translation.delete()
        return JsonResponse({"deleted": True, "id": translation_id})
    if request.method != "GET":
        _apply_notification_template_translation_config(translation, _json_body(request))
        _audit_admin_settings(translation, "updated")
    return JsonResponse(_notification_template_translation_config_payload(translation))


__all__ = [
    "admin_settings_locations", "admin_settings_location_detail",
    "admin_settings_session_types", "admin_settings_session_type_detail",
    "admin_settings_languages", "admin_settings_language_detail",
    "admin_settings_dictionary_keys", "admin_settings_dictionary_key_detail",
    "admin_settings_dictionary_translations", "admin_settings_dictionary_translation_detail",
    "admin_settings_notification_template_translations",
    "admin_settings_notification_template_translation_detail",
]
