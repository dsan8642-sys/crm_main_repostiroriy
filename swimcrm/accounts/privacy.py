from django.db import transaction
from django.utils import timezone

from audit.models import audit
from billing.models import ReceiptFile


@transaction.atomic
def anonymize_parent_account(parent, *, actor=None):
    """RODO deletion path: remove direct personal data while preserving ledgers/payments.

    Accounting facts and attendance history remain, but names, contacts, medical
    notes, emergency contacts and receipt blobs are scrubbed.
    """
    student_ids = list(parent.students.values_list("id", flat=True))
    now = timezone.now()

    for receipt in ReceiptFile.objects.filter(payment__student_id__in=student_ids, is_deleted=False):
        if receipt.file:
            receipt.file.delete(save=False)
        receipt.file = None
        receipt.is_deleted = True
        receipt.deleted_at = now
        receipt.save(update_fields=["file", "is_deleted", "deleted_at"])

    for student in parent.students.all():
        student.first_name = "Удалён"
        student.last_name = f"Клиент #{student.id}"
        student.email = ""
        student.medical_info = ""
        student.contraindications = ""
        student.emergency_contact_name = ""
        student.emergency_contact_phone = ""
        student.admin_comments = ""
        student.is_active = False
        student.save(update_fields=[
            "first_name", "last_name", "email", "medical_info",
            "contraindications", "emergency_contact_name",
            "emergency_contact_phone", "admin_comments", "is_active",
        ])

    parent.phone = ""
    parent.email = ""
    parent.telegram_chat_id = ""
    parent.instagram_username = ""
    parent.save(update_fields=[
        "phone", "email", "telegram_chat_id", "instagram_username"])

    parent.consents.update(granted=False, revoked_at=now)

    user = parent.user
    user.username = f"deleted_parent_{parent.id}"
    user.first_name = ""
    user.last_name = ""
    user.email = ""
    user.is_active = False
    user.set_unusable_password()
    user.save(update_fields=["username", "first_name", "last_name", "email", "is_active", "password"])

    audit(actor, "privacy.parent_anonymized", parent, {"students": student_ids})
    return parent
