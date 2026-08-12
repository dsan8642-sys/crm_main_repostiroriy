from django.contrib import admin
from django.db import transaction

from audit.mixins import AuditAdminMixin

from .models import (Location, Session, SessionParticipant, SessionType,
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

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        if obj.pk:
            Session.objects.select_for_update().get(pk=obj.pk)
        obj.full_clean()
        return super().save_model(request, obj, form, change)


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

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions

    def has_delete_permission(self, request, obj=None):
        if (
            obj is not None
            and obj.session.session_type == SessionType.SPLIT
            and obj.session.attendance.exists()
        ):
            return False
        return super().has_delete_permission(request, obj)

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        session_ids = {obj.session_id}
        if obj.pk:
            previous_session_id = SessionParticipant.objects.filter(
                pk=obj.pk,
            ).values_list("session_id", flat=True).first()
            if previous_session_id:
                session_ids.add(previous_session_id)
        list(Session.objects.select_for_update().filter(
            pk__in=session_ids,
        ).order_by("pk"))
        obj.full_clean()
        return super().save_model(request, obj, form, change)

    @transaction.atomic
    def delete_model(self, request, obj):
        Session.objects.select_for_update().get(pk=obj.session_id)
        return super().delete_model(request, obj)
