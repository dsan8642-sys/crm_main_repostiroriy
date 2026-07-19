from django.core.exceptions import ValidationError
from django.db import models


def validate_language_code(value):
    if not value or len(value) > 12:
        raise ValidationError("language code must be 1-12 characters")
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
    if any(char not in allowed for char in value):
        raise ValidationError("language code may contain only letters, digits, hyphen, underscore")


class Language(models.Model):
    code = models.CharField(max_length=12, unique=True, validators=[validate_language_code])
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def clean(self):
        self.code = (self.code or "").strip().lower()

    def __str__(self):
        return f"{self.code} - {self.name}"


class DictionaryKey(models.Model):
    domain = models.CharField(max_length=80)
    code = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["domain", "code"]
        constraints = [
            models.UniqueConstraint(fields=["domain", "code"], name="uniq_dictionary_domain_code"),
        ]

    def clean(self):
        self.domain = (self.domain or "").strip()
        self.code = (self.code or "").strip()
        if not self.domain:
            raise ValidationError("domain is required")
        if not self.code:
            raise ValidationError("code is required")

    def __str__(self):
        return f"{self.domain}.{self.code}"


class DictionaryTranslation(models.Model):
    key = models.ForeignKey(DictionaryKey, on_delete=models.CASCADE, related_name="translations")
    language_code = models.CharField(max_length=12, validators=[validate_language_code])
    value = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key__domain", "key__code", "language_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["key", "language_code"],
                name="uniq_dictionary_translation_key_language",
            ),
        ]

    def clean(self):
        self.language_code = (self.language_code or "").strip().lower()
        if not self.value:
            raise ValidationError("value is required")

    def __str__(self):
        return f"{self.key} [{self.language_code}]"
