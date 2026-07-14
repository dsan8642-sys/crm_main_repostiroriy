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
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    birth_date = models.DateField(null=True, blank=True)
    # Phone lives on the family (ParentAccount), not per-child — see DECISIONS.md #3.
    email = models.EmailField(blank=True)
    is_account_holder = models.BooleanField(default=False)
    group = models.ForeignKey(
        "catalog.Group", null=True, blank=True, on_delete=models.SET_NULL, related_name="students")

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

    def __str__(self):
        return self.full_name
