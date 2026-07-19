from django.conf import settings

from .models import DictionaryKey, DictionaryTranslation


def default_language_code():
    return getattr(settings, "SWIMCRM_DEFAULT_LANGUAGE", settings.LANGUAGE_CODE.split("-")[0]).lower()


def translate(domain, code, language_code=None, default=""):
    language = (language_code or default_language_code()).lower()
    base_language = default_language_code()
    qs = DictionaryTranslation.objects.select_related("key").filter(
        key__domain=domain,
        key__code=code,
        key__is_active=True,
    )
    row = qs.filter(language_code=language).first()
    if row:
        return row.value
    if language != base_language:
        row = qs.filter(language_code=base_language).first()
        if row:
            return row.value
    key = DictionaryKey.objects.filter(domain=domain, code=code, is_active=True).first()
    return default or (key.code if key else code)
