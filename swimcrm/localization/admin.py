from django.contrib import admin

from .models import DictionaryKey, DictionaryTranslation, Language


@admin.register(Language)
class LanguageAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")


@admin.register(DictionaryKey)
class DictionaryKeyAdmin(admin.ModelAdmin):
    list_display = ("domain", "code", "is_active")
    list_filter = ("domain", "is_active")
    search_fields = ("domain", "code")


@admin.register(DictionaryTranslation)
class DictionaryTranslationAdmin(admin.ModelAdmin):
    list_display = ("key", "language_code", "updated_at")
    list_filter = ("language_code", "key__domain")
    search_fields = ("key__domain", "key__code", "value")
    autocomplete_fields = ("key",)
