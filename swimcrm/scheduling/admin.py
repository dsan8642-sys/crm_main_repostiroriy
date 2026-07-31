from django.contrib import admin

from audit.mixins import AuditAdminMixin

from .models import (Location, Session, SessionParticipant,
                     SessionTypeConfig, WaitlistEntry)


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "timezone", "is_active", "updated_at")
    list_filter = ("is_active", "timezone")
    search_fields = ("code", "name", "address")


@admin.register(SessionTypeConfig)
class SessionTypeConfigAdmin(admin.ModelAdmin):
    list_display = ("code", "label", "default_capacity", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("code", "label")


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
    autocomplete_fields = ("group", "trainer", "individual_student")
    date_hierarchy = "start_at"


@admin.register(WaitlistEntry)
class WaitlistEntryAdmin(AuditAdminMixin, admin.ModelAdmin):
    audit_action_prefix = "waitlist"
    list_display = ("session", "student", "priority", "status", "created_at", "updated_at")
    list_filter = ("status", "session__location", "session__start_at")
    search_fields = (
        "student__first_name", "student__last_name", "student__parent__phone",
        "session__location", "note",
    )
    autocomplete_fields = ("session", "student")
    date_hierarchy = "created_at"


@admin.register(SessionParticipant)
class SessionParticipantAdmin(AuditAdminMixin, admin.ModelAdmin):
    audit_action_prefix = "session_participant"
    list_display = ("session", "student", "source", "status", "created_at", "updated_at")
    list_filter = ("source", "status", "session__location", "session__start_at")
    search_fields = (
        "student__first_name", "student__last_name", "student__parent__phone",
        "session__location", "note",
    )
    autocomplete_fields = ("session", "student")
    date_hierarchy = "created_at"
