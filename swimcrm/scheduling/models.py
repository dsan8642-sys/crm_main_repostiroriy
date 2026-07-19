from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone as dj_timezone


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
    location = models.CharField(max_length=120)
    max_participants = models.PositiveIntegerField()

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
        ]

    @property
    def effective_trainer(self):
        return self.substitute_trainer or self.trainer

    def clean(self):
        if self.substitute_trainer_id and self.substitute_trainer_id == self.trainer_id:
            raise ValidationError("substitute trainer must differ from scheduled trainer")
        if self.end_at <= self.start_at:
            raise ValidationError("Время окончания должно быть позже начала")

    def __str__(self):
        return f"{self.start_at:%d.%m %H:%M} · {self.location}"
