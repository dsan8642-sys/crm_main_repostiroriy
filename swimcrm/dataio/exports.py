"""Versioned, round-trip-oriented exports for the five admin datasets."""
from django.utils import timezone

from accounts.models import Trainer
from attendance.models import AttendanceRecord
from billing.models import Payment
from catalog.models import Group
from students.models import Student

from analytics.exporters import rows_to_csv, rows_to_xlsx

from .contracts import CONTRACTS, METADATA_KEYS, SCHEMA_VERSION, SOURCE_SYSTEM


def _iso(value):
    return value.isoformat() if value is not None else ""


def _bool(value):
    return "true" if value else "false"


def _client_row(student):
    parent = student.parent
    user = parent.user
    subscription = student.subscriptions.select_related("subscription_type").order_by("-created_at", "-id").first()
    return {
        "record_id": student.id,
        "parent_record_id": parent.id,
        "parent_username": user.username,
        "parent_first_name": user.first_name,
        "parent_last_name": user.last_name,
        "parent_phone": parent.phone,
        "parent_email": parent.email,
        "preferred_language": parent.preferred_language,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "name": student.full_name,
        "birth_date": _iso(student.birth_date),
        "email": student.email,
        "is_account_holder": _bool(student.is_account_holder),
        "group_id": student.group_id or "",
        "group_name": student.group.name if student.group else "",
        "medical_info": student.medical_info,
        "contraindications": student.contraindications,
        "emergency_contact_name": student.emergency_contact_name,
        "emergency_contact_phone": student.emergency_contact_phone,
        "is_active": _bool(student.is_active),
        "admin_comments": student.admin_comments,
        "subscription_type_name": subscription.subscription_type.name if subscription else "",
    }


def _payment_row(payment):
    student = payment.student
    return {
        "record_id": payment.id,
        "client_id": student.id,
        "client_email": student.email,
        "client_phone": student.parent.phone,
        "client_first_name": student.first_name,
        "client_last_name": student.last_name,
        "client_birth_date": _iso(student.birth_date),
        "client": student.full_name,
        "amount": payment.amount.format(),
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
        "paid_at": _iso(payment.paid_at),
        "method": payment.method,
        "status": payment.status,
        "comment": payment.comment,
        "reference_id": payment.reference_id,
        "source": payment.source,
        "created_at": _iso(payment.created_at),
        "confirmed_at": _iso(payment.confirmed_at),
    }


def _attendance_row(record):
    session = record.session
    student = record.student
    trainer = session.trainer
    return {
        "record_id": record.id,
        "session_id": session.id,
        "client_id": student.id,
        "client_email": student.email,
        "client_phone": student.parent.phone,
        "client_first_name": student.first_name,
        "client_last_name": student.last_name,
        "client_birth_date": _iso(student.birth_date),
        "client": student.full_name,
        "group_id": session.group_id or "",
        "group_name": session.group.name if session.group else "",
        "trainer_id": trainer.id,
        "trainer_username": trainer.user.username,
        "trainer_email": trainer.user.email,
        "session_type": session.session_type,
        "start_at": _iso(session.start_at),
        "end_at": _iso(session.end_at),
        "duration_minutes": session.duration_minutes,
        "location": session.location,
        "max_participants": session.max_participants,
        "price_minor": session.price_minor if session.price_minor is not None else "",
        "currency": session.currency,
        "status": record.status,
        "comment": record.comment,
        "financial_effects_enabled": _bool(record.financial_effects_enabled),
        "marked_at": _iso(record.marked_at),
    }


def _group_row(group):
    return {
        "record_id": group.id,
        "name": group.name,
        "description": group.description,
        "default_trainer_id": group.default_trainer_id or "",
        "default_trainer_username": (
            group.default_trainer.user.username if group.default_trainer else ""),
        "price_minor": group.price_minor if group.price_minor is not None else "",
        "currency": group.currency,
        "default_capacity": group.default_capacity if group.default_capacity is not None else "",
        "color_key": group.color_key or "",
        "is_active": _bool(group.is_active),
    }


def _trainer_row(trainer):
    return {
        "record_id": trainer.id,
        "username": trainer.user.username,
        "first_name": trainer.user.first_name,
        "last_name": trainer.user.last_name,
        "email": trainer.user.email,
        "phone": trainer.phone,
        "is_active": _bool(trainer.is_active),
    }


DATASETS = {
    "clients": lambda: (Student.objects.select_related("group", "parent__user").prefetch_related("subscriptions__subscription_type"), _client_row),
    "payments": lambda: (Payment.objects.select_related("student__parent"), _payment_row),
    "attendance": lambda: (AttendanceRecord.objects.select_related(
        "session__group", "session__trainer__user", "student__parent"), _attendance_row),
    "groups": lambda: (Group.objects.select_related("default_trainer__user"), _group_row),
    "trainers": lambda: (Trainer.objects.select_related("user"), _trainer_row),
}


def entity_dataset(name):
    if name not in DATASETS:
        raise ValueError(f"Неизвестная сущность: {name}")
    contract = CONTRACTS[name]
    queryset, row_builder = DATASETS[name]()
    exported_at = timezone.now().isoformat()
    headers = [*METADATA_KEYS, *(f"{field.key} [{field.label}]" for field in contract.fields)]
    rows = []
    for obj in queryset:
        values = row_builder(obj)
        metadata = {
            "schema_version": SCHEMA_VERSION,
            "exported_at": exported_at,
            "source_system": SOURCE_SYSTEM,
            "entity_type": name,
        }
        rows.append([*(metadata[key] for key in METADATA_KEYS),
                     *(values.get(field.key, "") for field in contract.fields)])
    return contract.label, headers, rows


# Compatibility names remain public for existing callers/tests.
def clients_dataset(): return entity_dataset("clients")
def payments_dataset(): return entity_dataset("payments")
def attendance_dataset(): return entity_dataset("attendance")
def groups_dataset(): return entity_dataset("groups")
def trainers_dataset(): return entity_dataset("trainers")


def export_entity(name, fmt="xlsx"):
    if fmt not in {"csv", "xlsx"}:
        raise ValueError(f"Неизвестный формат: {fmt}")
    title, headers, rows = entity_dataset(name)
    if fmt == "csv":
        return f"{name}.csv", rows_to_csv(headers, rows)
    return f"{name}.xlsx", rows_to_xlsx(title, headers, rows)
