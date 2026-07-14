from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

def validate_sms_template(body: str):
    """SMS must stay within one 160-character GSM-like segment."""
    bad = sorted({c for c in body if ord(c) > 127})
    if bad:
        raise ValidationError(f"SMS template contains Polish diacritics: {' '.join(bad)}")
    if len(body) >= 160:
        raise ValidationError(f"SMS template is longer than 160 characters ({len(body)})")


class EventType(models.TextChoices):
    PAYMENT_REMINDER = "payment_reminder", "Payment reminder"
    SESSION_REMINDER = "session_reminder", "Session reminder"
    SUBSCRIPTION_END = "subscription_end", "Subscription end"
    RENEWAL_NEEDED = "renewal_needed", "Renewal needed"
    SCHEDULE_CHANGE = "schedule_change", "Schedule change"
    MASS_MAILING = "mass_mailing", "Mass mailing"


class Channel(models.TextChoices):
    EMAIL = "email", "Email"
    TELEGRAM = "telegram", "Telegram"
    SMS = "sms", "SMS"


SUPPORTED_NOTIFICATION_CHANNELS = frozenset(Channel.values)


class NotificationTemplate(models.Model):
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    channel = models.CharField(max_length=16, choices=Channel.choices)
    subject = models.CharField(max_length=200, blank=True)
    body = models.TextField(help_text="Variables: {student}, {amount}, {date}, etc.")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["event_type", "channel"], name="uniq_template_event_channel"),
        ]

    def clean(self):
        if self.channel == Channel.SMS:
            validate_sms_template(self.body)

    def __str__(self):
        return f"{self.get_event_type_display()} / {self.get_channel_display()}"


class NotificationRule(models.Model):
    """Configurable timing: offset relative to an event reference time."""
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    channel = models.CharField(max_length=16, choices=Channel.choices)
    template = models.ForeignKey(NotificationTemplate, on_delete=models.PROTECT)
    offset_minutes = models.IntegerField(
        default=0,
        help_text="Offset from event time in minutes. Negative means before the event.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["event_type", "channel", "offset_minutes"],
                name="uniq_notification_rule_event_channel_offset",
            ),
        ]

    def clean(self):
        if self.template_id:
            if self.template.event_type != self.event_type:
                raise ValidationError("template event_type must match rule event_type")
            if self.template.channel != self.channel:
                raise ValidationError("template channel must match rule channel")

    def __str__(self):
        return f"{self.get_event_type_display()} @ {self.offset_minutes}m / {self.get_channel_display()}"


class DeliveryStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    SENT = "sent", "Sent"
    DELIVERED = "delivered", "Delivered"
    FAILED = "failed", "Failed"


class NotificationLog(models.Model):
    recipient = models.ForeignKey("accounts.ParentAccount", on_delete=models.CASCADE, related_name="notifications")
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    channel = models.CharField(max_length=16, choices=Channel.choices)
    status = models.CharField(max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.QUEUED)
    retries = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    subject = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    provider_message_id = models.CharField(max_length=200, blank=True)
    # Idempotency: one send per recipient/event/channel/reference moment.
    dedup_key = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["dedup_key"],
                condition=~models.Q(dedup_key=""),
                name="uniq_notification_dedup",
            ),
        ]

    def __str__(self):
        return f"{self.recipient} / {self.get_event_type_display()} / {self.get_status_display()}"
