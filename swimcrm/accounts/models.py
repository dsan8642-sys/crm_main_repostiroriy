from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from uuid import uuid4
import re


def normalize_phone(value):
    return re.sub(r"\D", "", value or "")


class Role(models.TextChoices):
    ADMIN = "admin", "Администратор"
    TRAINER = "trainer", "Тренер"
    PARENT = "parent", "Родитель"


class User(AbstractUser):
    """Auth identity. Domain attributes live in ParentAccount / Trainer profiles."""
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.PARENT)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"


class ClientPortalSettings(models.Model):
    """Persistent settings that control what families can see in their portal."""
    history_from = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Настройки клиентского кабинета"

    def __str__(self):
        return "Настройки клиентского кабинета"


class ParentAccount(models.Model):
    """Rule 7: the login owner, notification recipient, RODO consent subject.
    One parent -> many students. The phone is a family-level contact: one phone
    per family, no duplicates (DECISIONS.md #3); children carry no own phone."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="parent_account")
    phone = models.CharField(
        max_length=32, blank=True,
        help_text="Один телефон на семью (без дубликатов)")
    phone_normalized = models.CharField(max_length=32, blank=True, db_index=True)
    email = models.EmailField(blank=True)
    telegram_chat_id = models.CharField(max_length=64, blank=True)
    instagram_username = models.CharField(max_length=30, blank=True)
    preferred_language = models.CharField(max_length=12, default=settings.SWIMCRM_DEFAULT_LANGUAGE)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            # DECISIONS.md #3: one phone per family, unique across families
            # (partial: legacy/blank phones are not forced unique).
            models.UniqueConstraint(
                fields=["phone"], condition=~Q(phone=""), name="uniq_parent_phone_nonblank"),
        ]

    def __str__(self):
        return self.user.get_full_name() or self.user.username

    def save(self, *args, **kwargs):
        self.phone_normalized = normalize_phone(self.phone)
        if kwargs.get("update_fields") is not None and "phone" in kwargs["update_fields"]:
            kwargs["update_fields"] = set(kwargs["update_fields"]) | {"phone_normalized"}
        super().save(*args, **kwargs)


class AccessPurpose(models.TextChoices):
    ACTIVATION = "activation", "Activation"
    RECOVERY = "recovery", "Recovery"
    ADMIN_INVITE = "admin_invite", "Admin invitation"


class AccountActivation(models.Model):
    """Single-use, hash-only credential for client or trainer portal access."""
    parent = models.ForeignKey(
        ParentAccount, null=True, blank=True, on_delete=models.CASCADE,
        related_name="activations")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
        related_name="account_activations")
    purpose = models.CharField(
        max_length=16, choices=AccessPurpose.choices, default=AccessPurpose.ACTIVATION)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="created_client_activations")
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def is_valid(self):
        return bool(self.user_id or self.parent_id) and self.used_at is None and self.expires_at > timezone.now()


class Trainer(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="trainer_profile")
    phone = models.CharField(max_length=32, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.user.get_full_name() or self.user.username


class ConsentType(models.TextChoices):
    DATA_PROCESSING = "data", "Обработка персональных данных"
    EMAIL = "email", "Рассылки по email"
    SMS = "sms", "SMS"
    TELEGRAM = "telegram", "Telegram"


class Consent(models.Model):
    """RODO: granular consent per channel + data processing, revocable (rule 5.6)."""
    parent = models.ForeignKey(ParentAccount, on_delete=models.CASCADE, related_name="consents")
    type = models.CharField(max_length=16, choices=ConsentType.choices)
    granted = models.BooleanField(default=False)
    granted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    policy_version = models.CharField(max_length=32, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["parent", "type"], name="uniq_parent_consent_type"),
        ]

    def grant(self, policy_version=""):
        self.granted = True
        self.granted_at = timezone.now()
        self.revoked_at = None
        self.policy_version = policy_version
        self.save()

    def revoke(self):
        self.granted = False
        self.revoked_at = timezone.now()
        self.save()

    @property
    def is_active(self):
        return self.granted and self.revoked_at is None

    def __str__(self):
        return f"{self.parent} · {self.get_type_display()} · {'да' if self.is_active else 'нет'}"


class AdminOTPDevice(models.Model):
    """TOTP device for admin/staff 2FA, enrolled in CRM or by console."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="admin_otp_device")
    secret = models.CharField(max_length=64)
    is_confirmed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    last_used_counter = models.PositiveBigIntegerField(null=True, blank=True)
    enforced = models.BooleanField(default=False)
    generation = models.UUIDField(default=uuid4)

    def __str__(self):
        return f"2FA · {self.user}"


class LoginAttemptWindow(models.Model):
    key = models.CharField(max_length=64, unique=True)
    count = models.PositiveIntegerField(default=0)
    window_started_at = models.DateTimeField(default=timezone.now, db_index=True)
