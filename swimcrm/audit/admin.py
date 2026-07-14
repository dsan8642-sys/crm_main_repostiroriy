from django.contrib import admin

from .models import AuditLogEntry


@admin.register(AuditLogEntry)
class AuditAdmin(admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "entity_type", "entity_id")
    list_filter = ("action", "entity_type", "created_at")
    search_fields = (
        "actor__username", "actor__first_name", "actor__last_name",
        "action", "entity_type", "entity_id",
    )
    autocomplete_fields = ("actor",)
    date_hierarchy = "created_at"
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False
