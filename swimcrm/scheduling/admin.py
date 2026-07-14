from django.contrib import admin

from audit.mixins import AuditAdminMixin

from .models import RecurringTemplate, Session


@admin.register(RecurringTemplate)
class RecurringTemplateAdmin(AuditAdminMixin, admin.ModelAdmin):
    audit_action_prefix = "template"
    list_display = ("group", "trainer", "weekday", "start_time", "end_time", "location", "max_participants", "is_active")
    list_filter = ("weekday", "is_active", "trainer", "group")
    search_fields = (
        "group__name", "trainer__user__first_name", "trainer__user__last_name",
        "trainer__phone", "location",
    )
    autocomplete_fields = ("group", "trainer")


@admin.register(Session)
class SessionAdmin(AuditAdminMixin, admin.ModelAdmin):
    list_display = ("start_at", "end_at", "trainer", "group", "location", "max_participants",
                    "is_manually_modified", "is_cancelled")
    list_filter = ("session_type", "is_cancelled", "is_manually_modified", "trainer", "group", "location")
    search_fields = (
        "group__name", "individual_student__first_name", "individual_student__last_name",
        "trainer__user__first_name", "trainer__user__last_name", "trainer__phone",
        "location", "notes",
    )
    autocomplete_fields = ("template", "group", "trainer", "individual_student")
    date_hierarchy = "start_at"
