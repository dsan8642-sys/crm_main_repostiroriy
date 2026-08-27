import hashlib
import json
import tempfile
from datetime import date
from pathlib import Path

from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import AccountActivation, ParentAccount, User
from attendance.models import AttendanceRecord, AttendanceStatus
from audit.models import AuditLogEntry
from billing.models import Payment, PaymentStatus
from catalog.models import Group
from dataio.legacy_migration import execute_manifest, production_snapshot
from dataio.management.commands.seal_legacy_migration_manifest import build_family_create_client
from students.models import Student
from scheduling.services import create_session
from subscriptions.models import SessionLedgerEntry, Subscription
from subscriptions.services import create_subscription, manual_adjust
from tests import factories as f


class LegacyMigrationTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.type8 = f.make_sub_type(name="8 тренировок", sessions=8, days=31)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "approval.xlsx"
        self.source.write_bytes(b"approved workbook")

    def _client(self, legacy_id, student=None, **overrides):
        row = {
            "legacy_id": str(legacy_id),
            "approved": True,
            "action": "update" if student else "create",
            "fields": {"first_name": "Latin", "last_name": "Name"},
            "allow_name_overwrite": True,
        }
        if student:
            row["target_student_id"] = student.id
            row["expected_target"] = {
                "first_name": student.first_name,
                "last_name": student.last_name,
                "birth_date": student.birth_date.isoformat() if student.birth_date else None,
            }
        else:
            row["new_parent"] = {"phone": "", "email": ""}
        row.update(overrides)
        return row

    def _manifest(self, clients, balances=None, *, run_id="legacy-test-run"):
        manifest = {
            "schema_version": 1,
            "run_id": run_id,
            "source_workbook_sha256": hashlib.sha256(self.source.read_bytes()).hexdigest(),
            "target_snapshot_sha256": "",
            "expected_approved_legacy_count": len(clients),
            "subscription_type": {"name": "8 тренировок", "sessions_count": 8, "duration_days": 31},
            "clients": clients,
            "balances": balances or [],
            "exclusions": [
                {"legacy_id": "603302", "approved": True},
                {"legacy_id": "605680", "approved": True},
            ],
        }
        manifest["target_snapshot_sha256"] = production_snapshot(manifest)
        return manifest

    def _balance(self, legacy_id, current, adjustment):
        return {
            "legacy_id": str(legacy_id),
            "approved": True,
            "current_sessions": current,
            "legacy_adjustment_sessions": adjustment,
            "expected_final_sessions": current + adjustment,
            "pln_remainder": 0,
        }

    def test_dry_run_creates_nothing(self):
        student = f.make_student(first="Old", last="Name")
        manifest = self._manifest([self._client("1", student)])
        before = (Student.objects.count(), ParentAccount.objects.count(), AuditLogEntry.objects.count())
        report = execute_manifest(manifest, self.source, self.admin, commit=False)
        self.assertFalse(report["committed"])
        self.assertEqual(before, (Student.objects.count(), ParentAccount.objects.count(), AuditLogEntry.objects.count()))
        student.refresh_from_db()
        self.assertEqual(student.first_name, "Old")

    def test_sha_snapshot_and_incomplete_pln_block(self):
        student = f.make_student()
        manifest = self._manifest([self._client("1", student)])
        manifest["source_workbook_sha256"] = "0" * 64
        with self.assertRaisesMessage(ValidationError, "Source workbook SHA-256 mismatch"):
            execute_manifest(manifest, self.source, self.admin)
        manifest = self._manifest([self._client("1", student)])
        manifest["target_snapshot_sha256"] = "0" * 64
        with self.assertRaisesMessage(ValidationError, "snapshot drift"):
            execute_manifest(manifest, self.source, self.admin)
        manifest = self._manifest([self._client("1", student)], [self._balance("1", 0, 1)])
        manifest["balances"][0]["pln_remainder"] = 5
        with self.assertRaisesMessage(ValidationError, "unresolved PLN remainder"):
            execute_manifest(manifest, self.source, self.admin)

    def test_create_separate_uninvited_duda_accounts(self):
        clients = [
            self._client("gsheet:duda_aleksander", fields={"first_name": "Aleksander", "last_name": "Duda"}),
            self._client("gsheet:duda_jakub", fields={"first_name": "Jakub", "last_name": "Duda"}),
        ]
        manifest = self._manifest([], run_id="duda-separate")
        manifest["new_clients"] = clients
        manifest["target_snapshot_sha256"] = production_snapshot(manifest)
        execute_manifest(manifest, self.source, self.admin, commit=True)
        students = list(Student.objects.filter(last_name="Duda").select_related("parent__user").order_by("first_name"))
        self.assertEqual(len(students), 2)
        self.assertNotEqual(students[0].parent_id, students[1].parent_id)
        self.assertTrue(all(not st.parent.phone and not st.parent.email for st in students))
        self.assertTrue(all(not st.parent.user.has_usable_password() for st in students))
        self.assertTrue(all(not st.parent.user.is_active for st in students))
        self.assertTrue(all(":" not in st.parent.user.username for st in students))
        self.assertFalse(AccountActivation.objects.filter(user__in=[st.parent.user for st in students]).exists())

    def test_related_participants_share_family_without_collapsing(self):
        parent = f.make_parent()
        clients = [
            self._client("child-a", parent_target_id=parent.id),
            self._client("child-b", parent_target_id=parent.id),
        ]
        execute_manifest(self._manifest(clients), self.source, self.admin, commit=True)
        created = Student.objects.filter(parent=parent, first_name="Latin", last_name="Name")
        self.assertEqual(created.count(), 2)
        self.assertEqual(created.values("id").distinct().count(), 2)

    def test_approved_family_create_reuses_parent_without_contacts_or_group(self):
        canonical = f.make_student(group=Group.objects.create(name="Legacy family group"))
        row = build_family_create_client(
            "child-legacy",
            {"create_fields": {"first_name": "Sofiia", "last_name": "Bedun", "birth_date": None}},
            canonical,
        )
        manifest = self._manifest([self._client("canonical", canonical), row])
        execute_manifest(manifest, self.source, self.admin, commit=True)
        created = Student.objects.get(first_name="Sofiia", last_name="Bedun")
        self.assertEqual(created.parent_id, canonical.parent_id)
        self.assertIsNone(created.group_id)
        self.assertFalse(created.email)

    def test_payments_attendance_and_group_membership_are_unchanged(self):
        group = Group.objects.create(name="Protected group")
        student = f.make_student(group=group)
        Payment.objects.create(
            student=student, amount_minor=6500, currency="PLN", paid_at=date.today(),
            status=PaymentStatus.CONFIRMED,
        )
        session = create_session(
            trainer=f.make_trainer(), start_at=f.dt(2026, 8, 1, 10),
            location="Pool", max_participants=10, group=group,
        )
        attendance = AttendanceRecord.objects.create(
            session=session, student=student, status=AttendanceStatus.PRESENT,
        )
        payment_state = list(Payment.objects.values())
        attendance_state = list(AttendanceRecord.objects.values())
        execute_manifest(self._manifest([self._client("1", student)]), self.source, self.admin, commit=True)
        self.assertEqual(list(Payment.objects.values()), payment_state)
        self.assertEqual(list(AttendanceRecord.objects.values()), attendance_state)
        student.refresh_from_db()
        self.assertEqual(student.group_id, group.id)
        self.assertEqual(attendance.student_id, student.id)

    def test_filled_contacts_are_not_overwritten_and_groups_unchanged(self):
        group = Group.objects.create(name="Masters")
        parent = f.make_parent(phone="+48111111111")
        parent.email = "kept-parent@example.test"
        parent.save()
        student = f.make_student(parent=parent, group=group, email="kept@example.test")
        row = self._client("1", student)
        row["fields"].update({"email": "new@example.test", "phone": "+48222222222", "parent_email": "new-parent@example.test"})
        execute_manifest(self._manifest([row]), self.source, self.admin, commit=True)
        student.refresh_from_db(); parent.refresh_from_db()
        self.assertEqual(student.email, "kept@example.test")
        self.assertEqual(parent.phone, "+48111111111")
        self.assertEqual(parent.email, "kept-parent@example.test")
        self.assertEqual(student.group_id, group.id)

    def test_positive_zero_and_negative_adjustments_and_multiple_subscriptions(self):
        students = [f.make_student() for _ in range(3)]
        sub1 = create_subscription(student=students[0], subscription_type=self.type8, start_date=date.today())
        sub2 = create_subscription(student=students[0], subscription_type=self.type8, start_date=date.today())
        manual_adjust(subscription=sub1, delta=-3)
        sub_negative = create_subscription(student=students[2], subscription_type=self.type8, start_date=date.today())
        manual_adjust(subscription=sub_negative, delta=-8)
        clients = [self._client(str(i), st) for i, st in enumerate(students, 1)]
        balances = [self._balance("1", 13, 2), self._balance("2", 0, 0), self._balance("3", 0, -4)]
        execute_manifest(self._manifest(clients, balances), self.source, self.admin, commit=True)
        totals = [sum(sub.remaining_sessions for sub in st.subscriptions.all()) for st in students]
        self.assertEqual(totals, [15, 0, -4])
        self.assertEqual(SessionLedgerEntry.objects.filter(subscription__student=students[0], note__contains="Legacy migration").count(), 1)

    def test_no_existing_subscription_uses_one_manual_ledger_delta(self):
        student = f.make_student()
        manifest = self._manifest([self._client("1", student)], [self._balance("1", 0, -3)])
        execute_manifest(manifest, self.source, self.admin, commit=True)
        sub = Subscription.objects.get(student=student)
        entries = list(sub.ledger_entries.values_list("delta", flat=True))
        self.assertEqual(entries, [-3])
        self.assertEqual(sub.subscription_type, self.type8)

    def test_repeat_commit_is_idempotently_blocked(self):
        student = f.make_student()
        manifest = self._manifest([self._client("1", student)])
        execute_manifest(manifest, self.source, self.admin, commit=True)
        report = execute_manifest(manifest, self.source, self.admin, commit=True)
        self.assertTrue(report["already_committed"])
        self.assertEqual(report["operations"], 0)
        self.assertEqual(AuditLogEntry.objects.filter(action="legacy_migration.committed").count(), 1)

    def test_duplicate_target_and_excluded_sosnov_are_rejected(self):
        student = f.make_student()
        manifest = self._manifest([self._client("1", student), self._client("2", student)])
        with self.assertRaisesMessage(ValidationError, "distinct Student.id"):
            execute_manifest(manifest, self.source, self.admin)
        manifest = self._manifest([self._client("603302", student)])
        with self.assertRaisesMessage(ValidationError, "Excluded legacy_id"):
            execute_manifest(manifest, self.source, self.admin)

    def test_confirmed_legacy_alias_reuses_one_participant_without_duplicate_write(self):
        student = f.make_student(first="Before", last="Name")
        canonical = self._client("1", student)
        alias = {"legacy_id": "2", "approved": True, "action": "alias", "alias_of": "1"}
        manifest = self._manifest([canonical, alias])
        execute_manifest(manifest, self.source, self.admin, commit=True)
        student.refresh_from_db()
        self.assertEqual(student.first_name, "Latin")
        self.assertEqual(Student.objects.filter(first_name="Latin", last_name="Name").count(), 1)
        self.assertEqual(
            AuditLogEntry.objects.filter(action="legacy_migration.student_updated", entity_id=str(student.id)).count(),
            1,
        )
        alias_balance = self._manifest([canonical, alias], [self._balance("2", 0, 1)])
        with self.assertRaisesMessage(ValidationError, "consolidate alias correction"):
            execute_manifest(alias_balance, self.source, self.admin)

    def test_any_row_error_rolls_back_everything(self):
        student = f.make_student(first="Before")
        clients = [self._client("1", student), self._client("2", student=None, parent_target_id=999999)]
        manifest = self._manifest(clients)
        with self.assertRaises(ParentAccount.DoesNotExist):
            execute_manifest(manifest, self.source, self.admin, commit=True)
        student.refresh_from_db()
        self.assertEqual(student.first_name, "Before")
        self.assertFalse(AuditLogEntry.objects.filter(action="legacy_migration.committed").exists())

    def test_manifest_json_round_trip_is_stable(self):
        student = f.make_student()
        manifest = self._manifest([self._client("1", student)])
        path = Path(self.temp.name) / "manifest.json"
        path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), manifest)
