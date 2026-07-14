import logging

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

logger = logging.getLogger("audit")


class AuditLogEntry(models.Model):
    """Section 5.12: immutable record of who did what and when."""
    actor = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64)          # e.g. "payment.confirmed"
    entity_type = models.CharField(max_length=64)     # e.g. "Payment"
    entity_id = models.CharField(max_length=64, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["entity_type", "entity_id"])]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValidationError("Записи журнала действий неизменяемы")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Записи журнала действий нельзя удалять")

    def __str__(self):
        return f"{self.created_at:%d.%m %H:%M} · {self.actor} · {self.action}"


def audit(actor, action, instance, changes=None):
    entry = AuditLogEntry.objects.create(
        actor=actor, action=action,
        entity_type=type(instance).__name__, entity_id=str(getattr(instance, "pk", "")),
        changes=changes or {})
    logger.info(
        "audit_event action=%s entity_type=%s entity_id=%s actor_id=%s",
        entry.action,
        entry.entity_type,
        entry.entity_id,
        getattr(actor, "pk", None),
    )
    return entry
