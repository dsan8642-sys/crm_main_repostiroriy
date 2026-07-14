from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("session", "student", "status", "deducts", "marked_by", "marked_at")
    list_filter = ("status", "session__trainer", "session__group", "marked_by")
    search_fields = (
        "student__first_name", "student__last_name", "student__email",
        "student__parent__phone", "session__group__name",
        "session__trainer__user__first_name", "session__trainer__user__last_name",
        "comment",
    )
    autocomplete_fields = ("session", "student", "marked_by")
    date_hierarchy = "marked_at"
