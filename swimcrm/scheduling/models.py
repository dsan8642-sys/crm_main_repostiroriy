from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


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

    def clean(self):
        if self.end_at <= self.start_at:
            raise ValidationError("Время окончания должно быть позже начала")

    def __str__(self):
        return f"{self.start_at:%d.%m %H:%M} · {self.location}"
