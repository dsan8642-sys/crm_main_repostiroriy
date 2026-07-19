from django.contrib import admin

from .models import (NotificationLog, NotificationRule, NotificationTemplate,
                     NotificationTemplateTranslation, QuietHoursPolicy)


@admin.register(NotificationTemplate)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ("event_type", "channel")
    list_filter = ("channel", "event_type")
    search_fields = ("subject", "body")


@admin.register(NotificationTemplateTranslation)
class TemplateTranslationAdmin(admin.ModelAdmin):
    list_display = ("template", "language_code", "subject", "updated_at")
    list_filter = ("language_code", "template__event_type", "template__channel")
    search_fields = ("subject", "body")
    autocomplete_fields = ("template",)


@admin.register(NotificationRule)
class RuleAdmin(admin.ModelAdmin):
    list_display = ("event_type", "channel", "offset_minutes", "is_active")
    list_filter = ("channel", "event_type", "is_active")
    search_fields = ("template__subject", "template__body")
    autocomplete_fields = ("template",)


@admin.register(QuietHoursPolicy)
class QuietHoursPolicyAdmin(admin.ModelAdmin):
    list_display = ("channel", "starts_at", "ends_at", "timezone", "is_active")
    list_filter = ("channel", "timezone", "is_active")


@admin.register(NotificationLog)
class LogAdmin(admin.ModelAdmin):
    list_display = ("recipient", "event_type", "channel", "status", "language_code", "scheduled_at", "retries", "provider_message_id", "sent_at")
    list_filter = ("status", "channel", "event_type", "language_code", "created_at", "scheduled_at", "sent_at")
    search_fields = (
        "recipient__user__first_name", "recipient__user__last_name",
        "recipient__phone", "recipient__email", "dedup_key", "error",
        "subject", "body", "provider_message_id",
    )
    autocomplete_fields = ("recipient",)
    date_hierarchy = "created_at"
    readonly_fields = (
        "created_at", "scheduled_at", "last_attempt_at", "sent_at", "delivered_at",
        "subject", "body", "provider_message_id", "dedup_key", "payload",
    )
