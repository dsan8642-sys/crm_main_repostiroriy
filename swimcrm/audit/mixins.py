"""Admin mixin that records admin-driven create/update/delete into the immutable
audit log (section 5.12). Service-layer actions are audited in their services."""
from .models import AuditLogEntry, audit


class AuditAdminMixin:
    """Mix into a ModelAdmin to log who created/changed/deleted an entity and when.

    Set `audit_action_prefix` to control the action label (defaults to the model
    name lowercased), e.g. Student uses "client" -> "client.created".
    """
    audit_action_prefix = None

    def _audit_prefix(self):
        return self.audit_action_prefix or self.model.__name__.lower()

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        action = f"{self._audit_prefix()}.{'updated' if change else 'created'}"
        audit(request.user, action, obj,
              {"fields": list(form.changed_data)} if change else {})

    def delete_model(self, request, obj):
        # Capture identity before the row is gone.
        prefix, ref, pk = self._audit_prefix(), str(obj), str(obj.pk)
        etype = type(obj).__name__
        super().delete_model(request, obj)
        AuditLogEntry.objects.create(
            actor=request.user, action=f"{prefix}.deleted",
            entity_type=etype, entity_id=pk, changes={"repr": ref})

    def delete_queryset(self, request, queryset):
        prefix = self._audit_prefix()
        snapshot = [(type(o).__name__, str(o.pk), str(o)) for o in queryset]
        super().delete_queryset(request, queryset)
        for etype, pk, ref in snapshot:
            AuditLogEntry.objects.create(
                actor=request.user, action=f"{prefix}.deleted",
                entity_type=etype, entity_id=pk, changes={"repr": ref})
