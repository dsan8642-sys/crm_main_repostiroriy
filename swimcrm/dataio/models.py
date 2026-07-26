from django.db import models
from django.utils import timezone


class ImportKind(models.TextChoices):
    CLIENTS = "clients", "Clients"
    ATTENDANCE = "attendance", "Attendance"
    PAYMENTS = "payments", "Payments"


class ImportBatchStatus(models.TextChoices):
    PREVIEWED = "previewed", "Previewed"
    COMMITTED = "committed", "Committed"
    ROLLED_BACK = "rolled_back", "Rolled back"


class ImportEffectMode(models.TextChoices):
    NOT_APPLICABLE = "not_applicable", "Not applicable"
    HISTORY_ONLY = "history_only", "History only"
    APPLY_FINANCIAL = "apply_financial", "Apply financial effects"


class ImportBatch(models.Model):
    """Server-owned import plan and its immutable commit result."""
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    source_name = models.CharField(max_length=255, blank=True)
    kind = models.CharField(
        max_length=16, choices=ImportKind.choices, default=ImportKind.CLIENTS)
    status = models.CharField(
        max_length=16, choices=ImportBatchStatus.choices,
        default=ImportBatchStatus.COMMITTED)
    effect_mode = models.CharField(
        max_length=24,
        choices=ImportEffectMode.choices,
        default=ImportEffectMode.NOT_APPLICABLE,
    )
    input_data = models.JSONField(default=dict, blank=True)
    preview_expires_at = models.DateTimeField(null=True, blank=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    result = models.JSONField(default=dict, blank=True)
    created_student_ids = models.JSONField(default=list, blank=True)
    created_group_ids = models.JSONField(default=list, blank=True)
    created_parent_ids = models.JSONField(default=list, blank=True)
    created_subscription_ids = models.JSONField(default=list, blank=True)
    rows_total = models.PositiveIntegerField(default=0)
    rows_imported = models.PositiveIntegerField(default=0)
    is_rolled_back = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        state = "откачен" if self.is_rolled_back else self.get_status_display()
        return f"Импорт {self.created_at:%d.%m %H:%M} · {self.rows_imported}/{self.rows_total} ({state})"
