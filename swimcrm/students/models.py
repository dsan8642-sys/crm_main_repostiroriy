from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class Student(models.Model):
    """Participant profile attached to a client account.
    Children have no login of their own. Adult clients can be represented by
    an account-holder participant so billing, subscriptions and attendance keep
    one consistent target model.
    """
    parent = models.ForeignKey(
        "accounts.ParentAccount", on_delete=models.CASCADE, related_name="students")
    first_name = models.CharField(max_length=80, blank=True)
    last_name = models.CharField(max_length=80, blank=True)
    birth_date = models.DateField(null=True, blank=True)
    # Phone lives on the family (ParentAccount), not per-child — see DECISIONS.md #3.
    email = models.EmailField(blank=True)
    is_account_holder = models.BooleanField(default=False)
    groups = models.ManyToManyField(
        "catalog.Group", through="GroupMembership", related_name="students", blank=True)

    # 5.8: sports school for children -> medical data is critical
    medical_info = models.TextField(blank=True)
    contraindications = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)

    is_active = models.BooleanField(default=True)
    admin_comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # 5.8: uniqueness against dupes on non-empty email
            models.UniqueConstraint(
                fields=["email"], condition=~Q(email=""), name="uniq_student_email_nonblank"),
            models.UniqueConstraint(
                fields=["parent"], condition=Q(is_account_holder=True),
                name="uniq_account_holder_participant_per_client"),
        ]

    @property
    def full_name(self):
        return f"{self.last_name} {self.first_name}".strip()

    def clean(self):
        super().clean()
        if not (self.first_name.strip() or self.last_name.strip()):
            message = "Укажите имя или фамилию участника."
            raise ValidationError({"first_name": message, "last_name": message})

    @property
    def group(self):
        """Deprecated single-group view used only by compatibility callers."""
        legacy_group = getattr(self, "_legacy_group_assignment", None)
        if legacy_group is not None:
            return legacy_group
        if not self.pk:
            return None
        groups = list(self.groups.order_by("name", "id")[:2])
        return groups[0] if len(groups) == 1 else None

    @group.setter
    def group(self, value):
        self._legacy_group_assignment = value

    @property
    def group_id(self):
        group = self.group
        return group.id if group else None

    def save(self, *args, **kwargs):
        legacy_group = getattr(self, "_legacy_group_assignment", None)
        super().save(*args, **kwargs)
        if legacy_group is not None:
            GroupMembership.objects.get_or_create(student=self, group=legacy_group)
            del self._legacy_group_assignment

    def __str__(self):
        return self.full_name


class GroupMembership(models.Model):
    """Current, equal membership of a participant in one of at most three groups."""

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="group_memberships")
    group = models.ForeignKey(
        "catalog.Group", on_delete=models.CASCADE, related_name="student_memberships")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("student", "group"), name="uniq_student_group_membership"),
        ]
        indexes = [
            models.Index(fields=("group", "student")),
        ]

    def __str__(self):
        return f"{self.student} -> {self.group}"
