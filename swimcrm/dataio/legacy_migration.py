"""One-off, manifest-driven legacy migration. No public import contract changes."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, timedelta
from pathlib import Path

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from accounts.models import AccountActivation, ParentAccount, Role, User
from attendance.models import AttendanceRecord
from audit.models import AuditLogEntry, audit
from billing.models import Charge, Payment, PaymentEvent, ReceiptFile
from catalog.models import Group, SubscriptionType
from students.models import Student
from subscriptions.models import SessionLedgerEntry, Subscription, SubscriptionStatus
from subscriptions.services import manual_adjust


SCHEMA_VERSION = 1
COMMIT_ACTION = "legacy_migration.committed"
COMMIT_ENTITY_TYPE = "LegacyMigrationRun"
PROTECTED_EXCLUSIONS = {"603302", "605680"}


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_sha256(manifest):
    payload = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_manifest(path):
    with Path(path).open("r", encoding="utf-8") as stream:
        manifest = json.load(stream)
    if not isinstance(manifest, dict):
        raise ValidationError("Manifest root must be an object.")
    return manifest


def _rows(queryset, *fields):
    return [list(row) for row in queryset.order_by("id").values_list(*fields)]


def _all_rows(model, queryset=None):
    fields = [field.attname for field in model._meta.concrete_fields]
    return _rows(queryset if queryset is not None else model.objects.all(), *fields)


def production_snapshot(manifest):
    """Hash all protected financial/history state plus affected identity state."""
    target_ids = sorted(
        row["target_student_id"]
        for row in manifest.get("clients", []) + manifest.get("new_clients", [])
        if row.get("action") == "update" and isinstance(row.get("target_student_id"), int)
    )
    payload = {
        "students": _rows(
            Student.objects.filter(id__in=target_ids),
            "id", "parent_id", "first_name", "last_name", "birth_date", "email",
            "is_account_holder", "group_id", "is_active",
        ),
        "parents": _rows(
            ParentAccount.objects.filter(students__id__in=target_ids).distinct(),
            "id", "user_id", "phone", "email",
        ),
        "subscriptions": _rows(
            Subscription.objects.filter(student_id__in=target_ids),
            "id", "student_id", "subscription_type_id", "start_date", "base_end_date", "status",
        ),
        "ledger": _rows(
            SessionLedgerEntry.objects.filter(subscription__student_id__in=target_ids),
            "id", "subscription_id", "delta", "reason", "attendance_id", "note",
        ),
        "protected": {
            "payments": _all_rows(Payment),
            "payment_events": _all_rows(PaymentEvent),
            "receipt_files": _all_rows(ReceiptFile),
            "charges": _all_rows(Charge),
            "attendance": _all_rows(AttendanceRecord),
            "groups": _all_rows(Group),
            "student_groups": _rows(Student.objects.exclude(group_id=None), "id", "group_id"),
        },
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _require(condition, message):
    if not condition:
        raise ValidationError(message)


def validate_manifest(manifest, source_workbook, *, require_snapshot=True):
    _require(manifest.get("schema_version") == SCHEMA_VERSION, "Unsupported schema_version.")
    run_id = manifest.get("run_id")
    _require(isinstance(run_id, str) and 8 <= len(run_id) <= 64, "Invalid run_id.")
    _require(manifest.get("source_workbook_sha256") == file_sha256(source_workbook), "Source workbook SHA-256 mismatch.")
    expected_count = manifest.get("expected_approved_legacy_count")
    clients = manifest.get("clients")
    new_clients = manifest.get("new_clients", [])
    balances = manifest.get("balances")
    exclusions = manifest.get("exclusions")
    _require(isinstance(clients, list) and isinstance(new_clients, list) and isinstance(balances, list) and isinstance(exclusions, list), "Invalid manifest sections.")
    _require(isinstance(expected_count, int) and expected_count == len(clients), "Approved legacy count mismatch.")

    excluded_ids = {str(row.get("legacy_id")) for row in exclusions if row.get("approved") is True}
    _require(PROTECTED_EXCLUSIONS <= excluded_ids, "Both protected Sosnov exclusions must be approved.")
    legacy_ids = [str(row.get("legacy_id")) for row in clients]
    new_ids = [str(row.get("legacy_id")) for row in new_clients]
    _require(len(legacy_ids) == len(set(legacy_ids)), "Duplicate legacy_id in clients.")
    _require(len(new_ids) == len(set(new_ids)) and not (set(legacy_ids) & set(new_ids)), "Duplicate source ID in new_clients.")
    _require(not (set(legacy_ids) & excluded_ids), "Excluded legacy_id appears in clients.")
    _require(all(row.get("approved") is True for row in clients + new_clients), "Every client row must be approved.")
    _require(all(row.get("action") == "create" for row in new_clients), "new_clients rows must create participants.")

    all_clients = clients + new_clients
    client_by_legacy_id = {str(row.get("legacy_id")): row for row in all_clients}
    _require(len(client_by_legacy_id) == len(all_clients), "Duplicate legacy_id in approved clients.")
    alias_rows = [row for row in all_clients if row.get("action") == "alias"]
    for row in alias_rows:
        canonical_id = str(row.get("alias_of") or "")
        canonical = client_by_legacy_id.get(canonical_id)
        _require(canonical is not None, f"Alias {row.get('legacy_id')} has no canonical legacy ID.")
        _require(canonical.get("action") in {"update", "create"}, f"Alias {row.get('legacy_id')} must target a canonical client.")
    update_ids = [row.get("target_student_id") for row in all_clients if row.get("action") == "update"]
    _require(all(isinstance(pk, int) for pk in update_ids), "Update rows require integer target_student_id.")
    _require(len(update_ids) == len(set(update_ids)), "Each approved legacy ID must map to a distinct Student.id.")
    _require(all(row.get("action") in {"update", "create", "alias"} for row in all_clients), "Invalid client action.")

    balance_ids = [str(row.get("legacy_id")) for row in balances]
    _require(len(balance_ids) == len(set(balance_ids)), "Duplicate legacy_id in balances.")
    _require(set(balance_ids) <= (set(legacy_ids) | set(new_ids)), "Balance row has no approved client row.")
    for row in balances:
        legacy_id = str(row.get("legacy_id"))
        _require(client_by_legacy_id[legacy_id].get("action") != "alias", f"Balance {legacy_id}: consolidate alias correction on the canonical legacy ID.")
        _require(row.get("approved") is True, f"Balance {legacy_id} is not approved.")
        for field in ("current_sessions", "legacy_adjustment_sessions", "expected_final_sessions"):
            _require(type(row.get(field)) is int, f"Balance {legacy_id}: {field} must be an integer.")
        _require(row.get("pln_remainder") == 0, f"Balance {legacy_id}: unresolved PLN remainder.")
        _require(
            row["expected_final_sessions"] == row["current_sessions"] + row["legacy_adjustment_sessions"],
            f"Balance {legacy_id}: expected total does not reconcile.",
        )
    snapshot = manifest.get("target_snapshot_sha256")
    if require_snapshot:
        _require(isinstance(snapshot, str) and len(snapshot) == 64, "Target snapshot SHA-256 is required.")
    return run_id


def _current_sessions(student_id):
    total = SessionLedgerEntry.objects.filter(
        subscription__student_id=student_id,
        subscription__subscription_type__sessions_count__isnull=False,
    ).exclude(subscription__status=SubscriptionStatus.CANCELLED).aggregate(total=Sum("delta"))["total"]
    return total or 0


def _blank_fill(instance, field, value):
    if value and not getattr(instance, field):
        setattr(instance, field, value)
        return True
    return False


def _unique_username(run_id, legacy_id):
    base = re.sub(r"[^\w.@+-]", "_", f"legacy_{run_id}_{legacy_id}")[:145]
    candidate = base
    suffix = 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{base[:145-len(str(suffix))]}_{suffix}"
    return candidate


def _expected_identity(student):
    return {
        "first_name": student.first_name,
        "last_name": student.last_name,
        "birth_date": student.birth_date.isoformat() if student.birth_date else None,
    }


def _validate_target_state(manifest):
    rows = {str(row["legacy_id"]): row for row in manifest["clients"] + manifest.get("new_clients", [])}
    for legacy_id, row in rows.items():
        if row["action"] == "alias":
            continue
        if row["action"] == "update":
            student = Student.objects.get(id=row["target_student_id"])
            _require((row.get("expected_target") or {}) == _expected_identity(student), f"Identity drift for legacy {legacy_id}.")
    for balance in manifest["balances"]:
        client = rows[str(balance["legacy_id"])]
        actual = 0 if client["action"] == "create" else _current_sessions(client["target_student_id"])
        _require(actual == balance["current_sessions"], f"Balance drift for legacy {balance['legacy_id']}.")


def _create_parent(spec, run_id, legacy_id):
    # These accounts are archival contact containers.  They must not be able to
    # authenticate until staff explicitly activates them through the normal flow.
    user = User(username=_unique_username(run_id, legacy_id), role=Role.PARENT, is_active=False)
    user.set_unusable_password()
    user.first_name = spec.get("first_name", "")
    user.last_name = spec.get("last_name", "")
    user.email = spec.get("email", "")
    user.full_clean(exclude=["password"])
    user.save()
    return ParentAccount.objects.create(user=user, phone=spec.get("phone", ""), email=spec.get("email", ""))


def _apply_client(row, run_id, actor):
    legacy_id = str(row["legacy_id"])
    fields = row.get("fields") or {}
    if row["action"] == "create":
        parent_id = row.get("parent_target_id")
        if parent_id:
            parent = ParentAccount.objects.select_for_update().get(id=parent_id)
        else:
            parent = _create_parent(row.get("new_parent") or {}, run_id, legacy_id)
        student = Student(
            parent=parent,
            first_name=fields.get("first_name", ""),
            last_name=fields.get("last_name", ""),
            birth_date=fields.get("birth_date") or None,
            email=fields.get("email", ""),
            is_account_holder=bool(fields.get("is_account_holder", False)),
            group=None,
            is_active=True,
        )
        student.full_clean()
        student.save()
        audit(actor, "legacy_migration.student_created", student, {"run_id": run_id, "legacy_id": legacy_id})
        return student

    student = Student.objects.select_for_update().select_related("parent").get(id=row["target_student_id"])
    expected = row.get("expected_target") or {}
    _require(expected == _expected_identity(student), f"Identity drift for legacy {legacy_id}.")
    changed = []
    if row.get("allow_name_overwrite") is True:
        for field in ("first_name", "last_name"):
            value = fields.get(field)
            if value and value != getattr(student, field):
                setattr(student, field, value)
                changed.append(field)
    if _blank_fill(student, "email", fields.get("email")):
        changed.append("email")
    parent = student.parent
    if _blank_fill(parent, "phone", fields.get("phone")):
        parent.full_clean()
        parent.save(update_fields=["phone"])
        changed.append("parent.phone")
    if _blank_fill(parent, "email", fields.get("parent_email")):
        parent.full_clean()
        parent.save(update_fields=["email"])
        changed.append("parent.email")
    if changed:
        student.full_clean()
        student_fields = [field for field in changed if "." not in field]
        if student_fields:
            student.save(update_fields=student_fields)
        audit(actor, "legacy_migration.student_updated", student, {"run_id": run_id, "legacy_id": legacy_id, "fields": changed})
    return student


def _apply_balance(row, student, actor, run_id, subscription_type):
    current = _current_sessions(student.id)
    _require(current == row["current_sessions"], f"Balance drift for legacy {row['legacy_id']}.")
    adjustment = row["legacy_adjustment_sessions"]
    if adjustment:
        subscription = (
            Subscription.objects.select_for_update()
            .filter(student=student, subscription_type__sessions_count__isnull=False)
            .filter(status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.FROZEN])
            .order_by("-created_at", "-id")
            .first()
        )
        correction = adjustment
        if subscription is None:
            today = date.today()
            subscription = Subscription.objects.create(
                student=student,
                subscription_type=subscription_type,
                start_date=today,
                base_end_date=today + timedelta(days=subscription_type.duration_days),
                status=SubscriptionStatus.ACTIVE,
            )
            audit(actor, "subscription.created", subscription, {
                "type": subscription_type.name,
                "run_id": run_id,
                "without_purchase_credit": True,
            })
        if correction:
            manual_adjust(
                subscription=subscription,
                delta=correction,
                created_by=actor,
                note=f"Legacy migration {run_id}; legacy_id={row['legacy_id']}",
            )
    _require(_current_sessions(student.id) == row["expected_final_sessions"], f"Final balance mismatch for legacy {row['legacy_id']}.")


def execute_manifest(manifest, source_workbook, actor, *, commit=False):
    run_id = validate_manifest(manifest, source_workbook)
    digest = manifest_sha256(manifest)
    marker = AuditLogEntry.objects.filter(action=COMMIT_ACTION, entity_type=COMMIT_ENTITY_TYPE, entity_id=run_id).first()
    if marker:
        _require(marker.changes.get("manifest_sha256") == digest, "run_id was already used by a different manifest.")
        return {"run_id": run_id, "manifest_sha256": digest, "already_committed": True, "operations": 0}
    actual_snapshot = production_snapshot(manifest)
    _require(actual_snapshot == manifest["target_snapshot_sha256"], "Production snapshot drift detected.")
    _require(actor and actor.is_staff and actor.role == Role.ADMIN, "Actor must be a staff administrator.")
    _validate_target_state(manifest)
    stype_spec = manifest.get("subscription_type") or {}
    subscription_type = SubscriptionType.objects.get(
        name=stype_spec.get("name", "8 тренировок"),
        sessions_count=stype_spec.get("sessions_count", 8),
        duration_days=stype_spec.get("duration_days", 31),
        is_active=True,
    )

    canonical_clients = [
        row for row in manifest["clients"] + manifest.get("new_clients", [])
        if row["action"] != "alias"
    ]
    report = {
        "run_id": run_id,
        "manifest_sha256": digest,
        "target_snapshot_sha256": actual_snapshot,
        "legacy_clients": len(manifest["clients"]),
        "new_clients": len(manifest.get("new_clients", [])),
        "balances": len(manifest["balances"]),
        "operations": len(canonical_clients) + sum(row["legacy_adjustment_sessions"] != 0 for row in manifest["balances"]),
        "already_committed": False,
        "committed": bool(commit),
    }
    if not commit:
        return report

    with transaction.atomic():
        # ORM row lock serializes concurrent attempts without a schema change.
        subscription_type = SubscriptionType.objects.select_for_update().get(pk=subscription_type.pk)
        _require(
            not AuditLogEntry.objects.select_for_update().filter(
                action=COMMIT_ACTION, entity_type=COMMIT_ENTITY_TYPE, entity_id=run_id,
            ).exists(),
            "Migration run is already committed.",
        )
        _require(production_snapshot(manifest) == actual_snapshot, "Production snapshot drift detected.")
        protected_before = production_snapshot(manifest)
        protected_global_before = production_snapshot({"clients": []})
        students = {
            str(row["legacy_id"]): _apply_client(row, run_id, actor)
            for row in canonical_clients
        }
        for row in manifest["clients"] + manifest.get("new_clients", []):
            if row["action"] == "alias":
                students[str(row["legacy_id"])] = students[str(row["alias_of"])]
        for row in manifest["balances"]:
            _apply_balance(row, students[str(row["legacy_id"])], actor, run_id, subscription_type)
        # These tables are authoritative and must not be touched by this migration.
        protected_after = production_snapshot({"clients": []})
        _require(protected_after == protected_global_before, "Protected production history changed during migration.")
        _require(not AccountActivation.objects.filter(user__username__startswith=f"legacy_{run_id}_").exists(), "Activation token was created.")
        AuditLogEntry.objects.create(
            actor=actor, action=COMMIT_ACTION, entity_type=COMMIT_ENTITY_TYPE, entity_id=run_id,
            changes={**report, "manifest_sha256": digest, "precommit_snapshot_sha256": protected_before},
        )
    return report
