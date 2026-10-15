from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class AttendanceStatus(models.TextChoices):
    PRESENT = "present", "Присутствовал"
    ABSENT = "absent", "Отсутствовал"
    EXCUSED = "excused", "Отсутствовал по уважительной причине"
    RESCHEDULED = "rescheduled", "Перенос"


# Rule 2: which statuses consume a session (post -1 to the ledger).
DEDUCTING_STATUSES = {AttendanceStatus.PRESENT, AttendanceStatus.ABSENT}


class AttendancePaymentSource(models.TextChoices):
    AUTO = "", "Автоматически"
    ACCOUNT = "account", "Со счёта"
    SUBSCRIPTION = "subscription", "С абонемента"


class AttendanceRecord(models.Model):
    """Rule 2: status of a student on a concrete Session. One record per (session, student)."""
    session = models.ForeignKey("scheduling.Session", on_delete=models.CASCADE, related_name="attendance")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="attendance")
    status = models.CharField(max_length=16, choices=AttendanceStatus.choices, null=True, blank=True)
    comment = models.TextField(blank=True)
    marked_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    marked_at = models.DateTimeField(default=timezone.now)
    financial_effects_enabled = models.BooleanField(default=True, editable=False)
    payment_source = models.CharField(
        max_length=16, choices=AttendancePaymentSource.choices, blank=True, default="")
    payment_subscription = models.ForeignKey(
        "subscriptions.Subscription", null=True, blank=True, on_delete=models.PROTECT,
        related_name="paid_attendances")

    class Meta:
        constraints = [
            # Rule 5: prevents double-enrollment of a student on a session (DB-level).
            models.UniqueConstraint(fields=["session", "student"], name="uniq_session_student"),
        ]

    @property
    def deducts(self):
        return self.status in DEDUCTING_STATUSES

    def delete(self, *args, **kwargs):
        raise ValidationError("Attendance history is immutable and cannot be deleted.")

    def __str__(self):
        return f"{self.student} · {self.get_status_display()}"
