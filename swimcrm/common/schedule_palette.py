import json
from pathlib import Path

from django.core.exceptions import ValidationError


STANDARD_COLOR_KEY = "standard"
_MANIFEST_PATH = Path(__file__).with_name("schedule_palette.json")
with _MANIFEST_PATH.open(encoding="utf-8") as manifest_file:
    SCHEDULE_PALETTE = json.load(manifest_file)

SCHEDULE_COLOR_KEYS = frozenset(
    color["key"] for color in SCHEDULE_PALETTE["colors"]
)


class SessionTypeColorKeys(dict):
    def __init__(self, rows):
        rows = list(rows)
        super().__init__((code, color_key) for code, color_key, _label in rows)
        self.labels = {code: label for code, _color_key, label in rows}


def validate_schedule_color_key(value, field_name="color_key"):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or value not in SCHEDULE_COLOR_KEYS:
        raise ValidationError({field_name: ["Выберите цвет из утверждённой палитры."]})
    return value


def safe_schedule_color_key(value):
    return value if value in SCHEDULE_COLOR_KEYS else STANDARD_COLOR_KEY


def stored_schedule_color_key(value):
    return value if value in SCHEDULE_COLOR_KEYS else None


def session_type_color_keys():
    from scheduling.models import SessionTypeConfig

    rows = SessionTypeConfig.objects.values_list("code", "color_key", "label")
    return SessionTypeColorKeys(rows)


def resolve_session_color_key(session, type_color_keys=None):
    group_color = getattr(getattr(session, "group", None), "color_key", None)
    if group_color is not None:
        return safe_schedule_color_key(group_color)
    if type_color_keys is None:
        type_color_keys = session_type_color_keys()
    return safe_schedule_color_key(type_color_keys.get(session.session_type))
