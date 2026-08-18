import re
from urllib.parse import urlparse

from django.core.exceptions import ValidationError


INSTAGRAM_USERNAME = re.compile(r"^[a-z0-9._]{1,30}$")


def normalize_instagram_username(value):
    value = str(value or "").strip()
    if not value:
        return ""
    if value.startswith("@"):
        value = value[1:]
    elif "://" in value:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or parsed.netloc.lower().removeprefix("www.") != "instagram.com":
            raise ValidationError("Укажите имя профиля Instagram или ссылку instagram.com.")
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) != 1:
            raise ValidationError("Укажите ссылку на профиль Instagram.")
        value = parts[0]
    value = value.strip().lower()
    if not INSTAGRAM_USERNAME.fullmatch(value):
        raise ValidationError(
            "Имя Instagram может содержать только латинские буквы, цифры, точки и подчёркивания.")
    return value
