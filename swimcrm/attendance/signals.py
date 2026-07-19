from django.core.exceptions import ValidationError
from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import AttendanceRecord


@receiver(pre_delete, sender=AttendanceRecord)
def prevent_attendance_delete(sender, instance, **kwargs):
    raise ValidationError("Attendance history is immutable and cannot be deleted.")
