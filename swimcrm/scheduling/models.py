from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone as dj_timezone

from common.money import CURRENCY_CHOICES, Money


class Weekday(models.IntegerChoices):
    MON = 0, "Понедельник"
    TUE = 1, "Вторник"
    WED = 2, "Среда"
    THU = 3, "Четверг"
    FRI = 4, "Пятница"
    SAT = 5, "Суббота"
    SUN = 6, "Воскресенье"


class RecurringTemplate(models.Model):
    """Rule 4: rule for generating sessions (group, trainer, weekday, time, location, limit)."""
    group = models.ForeignKey("catalog.Group", on_delete=models.CASCADE, related_name="templates")
    trainer = models.ForeignKey("accounts.Trainer", on_delete=models.PROTECT, related_name="templates")
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    location = models.CharField(max_length=120)
    max_participants = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)

    def clean(self):
        if self.end_time <= self.start_time:
            raise ValidationError("Время окончания должно быть позже начала")

    def __str__(self):
        return f"{self.group} · {self.get_weekday_display()} {self.start_time:%H:%M}"


class WeeklyPlan(models.Model):
    group = models.ForeignKey(
        "catalog.Group", on_delete=models.CASCADE, related_name="weekly_plans")
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=dj_timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["group__name", "name", "id"]

    def clean(self):
        self.name = (self.name or "").strip()
        if not self.name:
            raise ValidationError("weekly plan name is required")

    def __str__(self):
        return f"{self.group} · {self.name}"


class WeeklyPlanSlot(models.Model):
    plan = models.ForeignKey(
        WeeklyPlan, on_delete=models.CASCADE, related_name="slots")
    trainer = models.ForeignKey(
        "accounts.Trainer", on_delete=models.PROTECT, related_name="weekly_plan_slots")
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=60)
    location = models.CharField(max_length=120)
    max_participants = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["weekday", "start_time", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "weekday", "start_time"],
                name="uniq_weekly_plan_slot_time",
            ),
        ]

    def clean(self):
        if not 15 <= self.duration_minutes <= 480 or self.duration_minutes % 5:
            raise ValidationError(
                "duration_minutes must be between 15 and 480 in five-minute increments")

    def __str__(self):
        return f"{self.plan} · {self.get_weekday_display()} {self.start_time:%H:%M}"


class ScheduleBatchStatus(models.TextChoices):
    PREVIEWED = "previewed", "Previewed"
    COMMITTED = "committed", "Committed"


class ScheduleOperationBatch(models.Model):
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    operation = models.CharField(max_length=32, default="copy_period")
    status = models.CharField(
        max_length=16, choices=ScheduleBatchStatus.choices,
        default=ScheduleBatchStatus.PREVIEWED)
    input_data = models.JSONField(default=dict)
    preview = models.JSONField(default=list)
    result = models.JSONField(default=dict)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(default=dj_timezone.now)
    committed_at = models.DateTimeField(null=True, blank=True)


class SessionType(models.TextChoices):
    GROUP = "group", "Групповая"
    INDIVIDUAL = "individual", "Индивидуальная"
    SPLIT = "split", "Split"


class Location(models.Model):
    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    address = models.CharField(max_length=240, blank=True)
    timezone = models.CharField(max_length=64, default="Europe/Warsaw")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=dj_timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]

    def clean(self):
        self.code = (self.code or "").strip().lower()
        self.name = (self.name or "").strip()
        if not self.code:
            raise ValidationError("code is required")
        if not self.name:
            raise ValidationError("name is required")
    def __str__(self):
        return self.name


class SessionTypeConfig(models.Model):
    code = models.CharField(max_length=16, choices=SessionType.choices, unique=True)
    label = models.CharField(max_length=120)
    default_capacity = models.PositiveIntegerField(null=True, blank=True)
    default_price_minor = models.BigIntegerField(null=True, blank=True)
    default_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES,
                                        default=settings.DEFAULT_CURRENCY)
    default_duration_minutes = models.PositiveSmallIntegerField(default=60)
    color_key = models.CharField(max_length=32, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=dj_timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def clean(self):
        if self.code not in SessionType.values:
            raise ValidationError("unsupported session type code")
        self.label = (self.label or "").strip()
        if not self.label:
            raise ValidationError("label is required")
        if self.default_price_minor is not None and self.default_price_minor < 0:
            raise ValidationError("default_price_minor cannot be negative")
        if (not 15 <= self.default_duration_minutes <= 480 or
                self.default_duration_minutes % 5):
            raise ValidationError(
                "default_duration_minutes must be between 15 and 480 in five-minute increments")

    def __str__(self):
        return self.label


class WaitlistStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PROMOTED = "promoted", "Promoted"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class SessionParticipantSource(models.TextChoices):
    MANUAL = "manual", "Manual"
    WAITLIST = "waitlist", "Waitlist"


class SessionParticipantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    CANCELLED = "cancelled", "Cancelled"


class SessionParticipant(models.Model):
    session = models.ForeignKey("scheduling.Session", on_delete=models.CASCADE, related_name="participants")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="session_participations")
    source = models.CharField(
        max_length=16,
        choices=SessionParticipantSource.choices,
        default=SessionParticipantSource.MANUAL,
    )
    status = models.CharField(
        max_length=16,
        choices=SessionParticipantStatus.choices,
        default=SessionParticipantStatus.ACTIVE,
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=dj_timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["session", "created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="uniq_session_participant_student"),
        ]
        indexes = [
            models.Index(fields=["session", "status"]),
            models.Index(fields=["student", "status"]),
        ]

    def clean(self):
        if self.source not in SessionParticipantSource.values:
            raise ValidationError("invalid session participant source")
        if self.status not in SessionParticipantStatus.values:
            raise ValidationError("invalid session participant status")
        if self.session_id and self.session.is_cancelled and self.status == SessionParticipantStatus.ACTIVE:
            raise ValidationError("cancelled sessions cannot have active participants")
        if self.student_id and not self.student.is_active and self.status == SessionParticipantStatus.ACTIVE:
            raise ValidationError("inactive students cannot be active session participants")
        if (self.student_id and self.student.parent_id and
                not self.student.parent.user.is_active and self.status == SessionParticipantStatus.ACTIVE):
            raise ValidationError("archived client accounts cannot have active session participants")

    def __str__(self):
        return f"{self.student} -> {self.session} ({self.source}/{self.status})"


class WaitlistEntry(models.Model):
    session = models.ForeignKey("scheduling.Session", on_delete=models.CASCADE, related_name="waitlist_entries")
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="waitlist_entries")
    priority = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=16,
        choices=WaitlistStatus.choices,
        default=WaitlistStatus.ACTIVE,
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=dj_timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["session", "priority", "created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="uniq_waitlist_session_student"),
        ]
        indexes = [
            models.Index(fields=["session", "status", "priority"]),
            models.Index(fields=["student", "status"]),
        ]

    def clean(self):
        if self.status not in WaitlistStatus.values:
            raise ValidationError("invalid waitlist status")
        if self.session_id and self.session.is_cancelled and self.status == WaitlistStatus.ACTIVE:
            raise ValidationError("cancelled sessions cannot have active waitlist entries")
        if self.student_id and not self.student.is_active and self.status == WaitlistStatus.ACTIVE:
            raise ValidationError("inactive students cannot have active waitlist entries")
        if (self.student_id and self.student.parent_id and
                not self.student.parent.user.is_active and self.status == WaitlistStatus.ACTIVE):
            raise ValidationError("archived client accounts cannot have active waitlist entries")

    def __str__(self):
        return f"{self.student} -> {self.session} ({self.status})"


class Session(models.Model):
    """Rule 4: a concrete class, generated from a template or created manually
    (incl. individual). Keeps a link to the template and a 'manually modified' flag."""
    template = models.ForeignKey(
        RecurringTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="sessions")
    weekly_plan_slot = models.ForeignKey(
        WeeklyPlanSlot, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="sessions")
    session_type = models.CharField(max_length=16, choices=SessionType.choices,
                                    default=SessionType.GROUP)
    group = models.ForeignKey("catalog.Group", null=True, blank=True,
                              on_delete=models.CASCADE, related_name="sessions")
    trainer = models.ForeignKey("accounts.Trainer", on_delete=models.PROTECT, related_name="sessions")
    substitute_trainer = models.ForeignKey(
        "accounts.Trainer", null=True, blank=True, on_delete=models.PROTECT,
        related_name="substituted_sessions")
    # Individual sessions (rule 6): admin assigns a specific student manually
    individual_student = models.ForeignKey(
        "students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="individual_sessions")

    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=60)
    location = models.CharField(max_length=120)
    max_participants = models.PositiveIntegerField()
    price_minor = models.BigIntegerField(
        null=True, blank=True, editable=False,
        help_text="Session price snapshot in minor currency units")
    currency = models.CharField(
        max_length=3, choices=CURRENCY_CHOICES, default=settings.DEFAULT_CURRENCY,
        editable=False)

    is_manually_modified = models.BooleanField(default=False)  # rule 4
    is_cancelled = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["trainer", "start_at"]),
            models.Index(fields=["substitute_trainer", "start_at"], name="scheduling__subst_8d1a1f_idx"),
            models.Index(fields=["group", "start_at"]),
        ]
        constraints = [
            # Base guard; a Postgres GIST exclusion constraint on (trainer, tstzrange)
            # is added in a separate, vendor-guarded migration for true race safety.
            models.UniqueConstraint(fields=["trainer", "start_at"],
                                    name="uniq_trainer_start"),
            # A session is either a group class or an individual one — exactly one
            # of (group, individual_student) is set (rule 6).
            models.CheckConstraint(
                condition=(Q(group__isnull=False, individual_student__isnull=True) |
                           Q(group__isnull=True, individual_student__isnull=False)),
                name="session_group_xor_individual"),
            models.CheckConstraint(
                condition=Q(price_minor__isnull=True) | Q(price_minor__gte=0),
                name="session_price_minor_nonnegative"),
            models.CheckConstraint(
                condition=Q(duration_minutes__gte=15) & Q(duration_minutes__lte=480),
                name="session_duration_minutes_range"),
        ]

    @property
    def effective_trainer(self):
        return self.substitute_trainer or self.trainer

    @property
    def price(self):
        return None if self.price_minor is None else Money(self.price_minor, self.currency)

    def clean(self):
        if self.substitute_trainer_id and self.substitute_trainer_id == self.trainer_id:
            raise ValidationError("substitute trainer must differ from scheduled trainer")
        if self.end_at <= self.start_at:
            raise ValidationError("Время окончания должно быть позже начала")
        if not 15 <= self.duration_minutes <= 480 or self.duration_minutes % 5:
            raise ValidationError(
                "duration_minutes must be between 15 and 480 in five-minute increments")
        expected_end = self.start_at + timedelta(minutes=self.duration_minutes)
        if self.end_at != expected_end:
            raise ValidationError("end_at must equal start_at + duration_minutes")

    def __str__(self):
        return f"{self.start_at:%d.%m %H:%M} · {self.location}"
