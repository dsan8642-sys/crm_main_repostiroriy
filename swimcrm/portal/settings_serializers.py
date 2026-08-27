from django.core.exceptions import ValidationError
from django.utils import timezone

from localization.models import DictionaryKey
from notifications.models import NotificationTemplate
from common.schedule_palette import stored_schedule_color_key, validate_schedule_color_key

from .support import (
    _bool_value,
    _field_validation_error,
    _object_for_field,
    _required_int,
)


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
        "color_key": stored_schedule_color_key(session_type.color_key),
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
        session_type.default_capacity = (
            None if value in (None, "")
            else _required_int(value, "default_capacity"))
        if session_type.default_capacity is not None and session_type.default_capacity <= 0:
            raise _field_validation_error(
                "default_capacity", "Вместимость должна быть больше нуля.",
                code="min_value")
    if "default_price_minor" in data:
        value = data.get("default_price_minor")
        session_type.default_price_minor = (
            None if value in (None, "")
            else _required_int(value, "default_price_minor"))
        if session_type.default_price_minor is not None and session_type.default_price_minor < 0:
            raise _field_validation_error(
                "default_price_minor", "Цена не может быть отрицательной.",
                code="min_value")
    if "default_currency" in data:
        session_type.default_currency = (data.get("default_currency") or "PLN").upper()
    if "default_duration_minutes" in data:
        duration = _required_int(
            data.get("default_duration_minutes"),
            "default_duration_minutes")
        if not 15 <= duration <= 480 or duration % 5:
            raise _field_validation_error(
                "default_duration_minutes",
                "Длительность должна быть от 15 до 480 минут с шагом 5 минут.",
                code="invalid_step")
        session_type.default_duration_minutes = duration
    if "color_key" in data:
        try:
            session_type.color_key = validate_schedule_color_key(data.get("color_key"))
        except ValidationError as exc:
            raise _field_validation_error(
                "color_key", "Выберите допустимый цвет расписания.",
                code="invalid_choice") from exc
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
        translation.key = _object_for_field(
            DictionaryKey.objects.filter(is_active=True), data.get("key_id"),
            "key_id", "ключ словаря")
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
        translation.template = _object_for_field(
            NotificationTemplate.objects.all(), data.get("template_id"),
            "template_id", "шаблон")
    if "language_code" in data:
        translation.language_code = data.get("language_code", "") or ""
    if "subject" in data:
        translation.subject = data.get("subject", "") or ""
    if "body" in data:
        translation.body = data.get("body", "") or ""
    translation.full_clean()
    translation.save()
    return translation
