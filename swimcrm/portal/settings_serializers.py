from django.shortcuts import get_object_or_404
from django.utils import timezone

from localization.models import DictionaryKey
from notifications.models import NotificationTemplate

from .support import _bool_value


def location_payload(location):
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


def apply_location(location, data):
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


def session_type_payload(session_type):
    return {
        "id": session_type.id,
        "code": session_type.code,
        "label": session_type.label,
        "default_capacity": session_type.default_capacity,
        "default_price_minor": session_type.default_price_minor,
        "default_currency": session_type.default_currency,
        "default_duration_minutes": session_type.default_duration_minutes,
        "is_active": session_type.is_active,
        "created_at": timezone.localtime(session_type.created_at).isoformat() if session_type.created_at else None,
        "updated_at": timezone.localtime(session_type.updated_at).isoformat() if session_type.updated_at else None,
    }


def apply_session_type(session_type, data):
    data = data.get("session_type") or data
    if "code" in data:
        session_type.code = data.get("code", "") or ""
    if "label" in data:
        session_type.label = data.get("label", "") or ""
    if "default_capacity" in data:
        value = data.get("default_capacity")
        session_type.default_capacity = None if value in (None, "") else int(value)
    if "default_price_minor" in data:
        value = data.get("default_price_minor")
        session_type.default_price_minor = None if value in (None, "") else int(value)
    if "default_currency" in data:
        session_type.default_currency = (data.get("default_currency") or "PLN").upper()
    if "default_duration_minutes" in data:
        session_type.default_duration_minutes = int(data.get("default_duration_minutes"))
    if "is_active" in data:
        session_type.is_active = _bool_value(data.get("is_active"), True)
    session_type.full_clean()
    session_type.save()
    return session_type


def language_payload(language):
    return {
        "id": language.id,
        "code": language.code,
        "name": language.name,
        "is_active": language.is_active,
    }


def apply_language(language, data):
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


def dictionary_key_payload(key):
    return {"id": key.id, "domain": key.domain, "code": key.code, "is_active": key.is_active}


def apply_dictionary_key(key, data):
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


def dictionary_translation_payload(translation):
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


def apply_dictionary_translation(translation, data):
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


def notification_translation_payload(translation):
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


def apply_notification_translation(translation, data):
    data = data.get("translation") or data
    if "template_id" in data:
        translation.template = get_object_or_404(
            NotificationTemplate, pk=data.get("template_id"))
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "subject" in data:
        translation.subject = data.get("subject", "") or ""
    if "body" in data:
        translation.body = data.get("body", "") or ""
    translation.full_clean()
    translation.save()
    return translation
