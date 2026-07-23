from datetime import date, timedelta
from unittest import skipUnless

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from common.money import Money
from accounts.models import Consent, ConsentType
from attendance.models import AttendanceRecord, AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentEvent, PaymentEventType, PaymentStatus, ReceiptFile
from billing.services import (charge_statuses, confirm_payment,
                              purge_expired_receipts, reject_payment,
                              student_balance)
from notifications.models import validate_sms_template
from scheduling.models import Session
from scheduling.services import (ScheduleConflict, create_session,
                                 generate_sessions)
from subscriptions.models import LedgerReason, SessionLedgerEntry, Subscription
from subscriptions.services import (create_subscription, freeze_subscription,
                                    manual_adjust)

from . import factories as f


class MoneyRule(TestCase):
    """Rule 0: integer minor units + ISO currency, never float."""
    def test_no_float_allowed(self):
        with self.assertRaises(TypeError):
            Money(120.5, "PLN")

    def test_arithmetic_and_format(self):
        self.assertEqual((Money(24000, "PLN") - Money(10000, "PLN")).amount_minor, 14000)
        self.assertEqual(Money(24050, "PLN").format(), "240,50 zł")

    def test_currency_mismatch_blocked(self):
        with self.assertRaises(ValueError):
            Money(100, "PLN") + Money(100, "EUR")


class LedgerRule(TestCase):
    """Rule 1: balance is SUM of ledger entries, not a stored counter. Immutable."""
    def test_purchase_posts_plus_n(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(sessions=8),
                                  start_date=date(2026, 1, 1))
        self.assertEqual(sub.remaining_sessions, 8)
        self.assertEqual(sub.ledger_entries.get().reason, LedgerReason.PURCHASE)

    def test_balance_is_sum_of_deltas(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(sessions=8),
                                  start_date=date(2026, 1, 1))
        manual_adjust(subscription=sub, delta=-3, note="test")
        manual_adjust(subscription=sub, delta=+1, note="test")
        self.assertEqual(sub.remaining_sessions, 8 - 3 + 1)

    def test_admin_manual_adjustment_can_move_balance_below_zero_without_note(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(sessions=2),
                                  start_date=date(2026, 1, 1))
        entry = manual_adjust(subscription=sub, delta=-3)

        self.assertEqual(entry.reason, LedgerReason.MANUAL)
        self.assertEqual(entry.note, "")
        self.assertEqual(sub.remaining_sessions, -1)

    def test_ledger_is_immutable(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(sessions=8),
                                  start_date=date(2026, 1, 1))
        entry = sub.ledger_entries.get()
        entry.delta = 999
        with self.assertRaises(ValidationError):
            entry.save()
        with self.assertRaises(ValidationError):
            entry.delete()
        with self.assertRaises(ValidationError):
            SessionLedgerEntry.objects.filter(pk=entry.pk).update(delta=999)
        with self.assertRaises(ValidationError):
            SessionLedgerEntry.objects.filter(pk=entry.pk).delete()
        entry.refresh_from_db()
        self.assertEqual(entry.delta, 8)
        self.assertEqual(sub.remaining_sessions, 8)

    def test_subscription_history_cannot_be_deleted(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(days=30, sessions=8),
                                  start_date=date(2026, 1, 1))
        freeze_subscription(subscription=sub, start_date=date(2026, 1, 10),
                            end_date=date(2026, 1, 12))

        with self.assertRaises(ValidationError):
            sub.delete()
        with self.assertRaises(ValidationError):
            Subscription.objects.filter(pk=sub.pk).delete()
        with self.assertRaises(ValidationError):
            st.delete()
        transaction.set_rollback(False)

        self.assertTrue(Subscription.objects.filter(pk=sub.pk).exists())
        self.assertEqual(sub.ledger_entries.count(), 1)
        self.assertEqual(sub.freeze_periods.count(), 1)

    def test_subscription_admin_disables_delete(self):
        from django.contrib.admin.sites import AdminSite

        from subscriptions.admin import SubscriptionAdmin

        sub = create_subscription(student=f.make_student(), subscription_type=f.make_sub_type(sessions=8),
                                  start_date=date(2026, 1, 1))
        subscription_admin = SubscriptionAdmin(Subscription, AdminSite())

        self.assertFalse(subscription_admin.has_delete_permission(request=None, obj=sub))


class AttendanceDeductionRule(TestCase):
    """Rule 2: PRESENT/ABSENT deduct -1; EXCUSED/RESCHEDULED do not."""
    def setUp(self):
        self.trainer = f.make_trainer()
        self.group = f.make_group()
        self.student = f.make_student(group=self.group)
        self.sub = create_subscription(student=self.student,
                                       subscription_type=f.make_sub_type(sessions=8),
                                       start_date=date.today() - timedelta(days=1))
        self.session = create_session(
            trainer=self.trainer, start_at=timezone.now(),
            end_at=timezone.now() + timedelta(hours=1),
            location="Бассейн A", max_participants=10, group=self.group)

    def _remaining(self):
        self.sub.refresh_from_db()
        return self.sub.remaining_sessions

    def test_present_deducts(self):
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.PRESENT)
        self.assertEqual(self._remaining(), 7)

    def test_absent_deducts(self):
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.ABSENT)
        self.assertEqual(self._remaining(), 7)

    def test_excused_does_not_deduct(self):
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.EXCUSED)
        self.assertEqual(self._remaining(), 8)

    def test_rescheduled_does_not_deduct(self):
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.RESCHEDULED)
        self.assertEqual(self._remaining(), 8)

    def test_status_change_posts_correction_not_edit(self):
        # present (-1) then corrected to excused (0): balance back to 8 via a +1 correction row
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.PRESENT)
        self.assertEqual(self._remaining(), 7)
        set_attendance(session_id=self.session.id, student=self.student, status=AttendanceStatus.EXCUSED)
        self.assertEqual(self._remaining(), 8)
        # ledger keeps both rows (purchase + attendance + correction) — append-only
        reasons = list(self.sub.ledger_entries.values_list("reason", flat=True))
        self.assertIn(LedgerReason.CORRECTION, reasons)
        self.assertEqual(len(reasons), 3)

    def test_attendance_history_cannot_be_deleted(self):
        record = set_attendance(
            session_id=self.session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
        )
        with self.assertRaises(ValidationError):
            record.delete()
        with self.assertRaises(ValidationError):
            AttendanceRecord.objects.filter(pk=record.pk).delete()
        transaction.set_rollback(False)
        self.assertTrue(AttendanceRecord.objects.filter(pk=record.pk).exists())

    def test_archived_student_cannot_have_attendance_marked(self):
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])

        with self.assertRaises(ValidationError):
            set_attendance(
                session_id=self.session.id,
                student=self.student,
                status=AttendanceStatus.PRESENT,
            )

    def test_unlimited_subscription_never_deducts(self):
        st = f.make_student(first="Ева")
        create_subscription(student=st, subscription_type=f.make_unlimited_type(),
                            start_date=date.today() - timedelta(days=1))
        rec = set_attendance(session_id=self.session.id, student=st, status=AttendanceStatus.PRESENT)
        self.assertFalse(rec.ledger_entries.exists())

    def test_participant_hard_delete_cannot_cascade_history(self):
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.CONFIRMED,
        )
        charge = Charge.objects.create(
            student=self.student,
            description="History charge",
            amount_minor=1000,
            currency="PLN",
            due_date=date.today(),
        )
        record = set_attendance(
            session_id=self.session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
        )

        with self.assertRaises(ValidationError):
            self.student.delete()
        transaction.set_rollback(False)

        self.assertTrue(Payment.objects.filter(pk=payment.pk).exists())
        self.assertTrue(Charge.objects.filter(pk=charge.pk).exists())
        self.assertTrue(AttendanceRecord.objects.filter(pk=record.pk).exists())
        self.assertTrue(self.student.__class__.objects.filter(pk=self.student.pk).exists())


class FreezeRule(TestCase):
    """Rule 3: freeze is an interval that shifts the end date; history preserved."""
    def test_freeze_shifts_end_date(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(days=30),
                                  start_date=date(2026, 1, 1))
        base_end = sub.base_end_date
        freeze_subscription(subscription=sub, start_date=date(2026, 1, 10),
                            end_date=date(2026, 1, 16))  # 7 inclusive days
        sub.refresh_from_db()
        self.assertEqual(sub.total_frozen_days, 7)
        self.assertEqual(sub.effective_end_date, base_end + timedelta(days=7))

    def test_subscription_is_valid_through_grace_period(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(days=30),
                                  start_date=date(2026, 1, 1))
        self.assertEqual(sub.grace_end_date, sub.effective_end_date + timedelta(days=7))
        self.assertTrue(sub.is_active_on(sub.effective_end_date + timedelta(days=7)))
        self.assertFalse(sub.is_active_on(sub.effective_end_date + timedelta(days=8)))

    def test_multiple_freezes_accumulate_and_keep_history(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(days=30),
                                  start_date=date(2026, 1, 1))
        admin = f.make_admin()
        freeze_subscription(subscription=sub, start_date=date(2026, 1, 10),
                            end_date=date(2026, 1, 12), created_by=admin)  # 3 days
        freeze_subscription(subscription=sub, start_date=date(2026, 2, 1),
                            end_date=date(2026, 2, 5), created_by=admin)   # 5 days
        sub.refresh_from_db()
        self.assertEqual(sub.total_frozen_days, 8)
        self.assertEqual(sub.freeze_periods.count(), 2)  # history kept
        self.assertTrue(all(fp.created_by == admin for fp in sub.freeze_periods.all()))

    def test_freeze_history_is_immutable(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(days=30),
                                  start_date=date(2026, 1, 1))
        freeze_subscription(subscription=sub, start_date=date(2026, 1, 10),
                            end_date=date(2026, 1, 12))
        fp = sub.freeze_periods.get()
        expected_end_date = sub.effective_end_date

        fp.end_date = date(2026, 1, 20)
        with self.assertRaises(ValidationError):
            fp.save()
        with self.assertRaises(ValidationError):
            fp.delete()
        with self.assertRaises(ValidationError):
            sub.freeze_periods.filter(pk=fp.pk).update(end_date=date(2026, 1, 20))
        with self.assertRaises(ValidationError):
            sub.freeze_periods.filter(pk=fp.pk).delete()
        sub.refresh_from_db()
        self.assertEqual(sub.freeze_periods.count(), 1)
        self.assertEqual(sub.effective_end_date, expected_end_date)


class ScheduleConflictRule(TestCase):
    """Rules 4 & 5: generate from template; trainer can't double-book; capacity limit."""
    def test_generate_from_template(self):
        tr = f.make_trainer(); g = f.make_group()
        tpl = f.make_template(g, tr)  # Mondays
        created, skipped = generate_sessions(tpl, date(2026, 6, 1), date(2026, 6, 30))
        self.assertEqual(len(created), 5)  # 5 Mondays in June 2026
        self.assertTrue(all(s.template_id == tpl.id for s in created))

    def test_trainer_double_booking_blocked(self):
        tr = f.make_trainer(); g = f.make_group()
        create_session(trainer=tr, start_at=f.dt(2026, 6, 1, 17), end_at=f.dt(2026, 6, 1, 18),
                       location="A", max_participants=10, group=g)
        with self.assertRaises(ScheduleConflict):
            create_session(trainer=tr, start_at=f.dt(2026, 6, 1, 17, 30),
                           end_at=f.dt(2026, 6, 1, 18, 30), location="B",
                           max_participants=10, group=g)

    def test_capacity_limit_enforced(self):
        tr = f.make_trainer(); g = f.make_group()
        sess = create_session(trainer=tr, start_at=f.dt(2026, 6, 1, 17),
                              end_at=f.dt(2026, 6, 1, 18), location="A",
                              max_participants=2, group=g)
        for i in range(2):
            set_attendance(session_id=sess.id, student=f.make_student(first=f"S{i}", last=f"L{i}"),
                           status=AttendanceStatus.PRESENT)
        with self.assertRaises(ValidationError):
            set_attendance(session_id=sess.id,
                           student=f.make_student(first="Extra", last="Kid"),
                           status=AttendanceStatus.PRESENT)

    def test_no_double_enrollment(self):
        tr = f.make_trainer(); g = f.make_group()
        sess = create_session(trainer=tr, start_at=f.dt(2026, 6, 1, 17),
                              end_at=f.dt(2026, 6, 1, 18), location="A",
                              max_participants=5, group=g)
        st = f.make_student()
        set_attendance(session_id=sess.id, student=st, status=AttendanceStatus.PRESENT)
        # second call updates the same record, not a duplicate
        set_attendance(session_id=sess.id, student=st, status=AttendanceStatus.ABSENT)
        self.assertEqual(sess.attendance.filter(student=st).count(), 1)

    def test_session_must_be_group_xor_individual(self):
        tr = f.make_trainer(); g = f.make_group(); st = f.make_student()
        base = dict(trainer=tr, start_at=f.dt(2026, 6, 1, 17), end_at=f.dt(2026, 6, 1, 18),
                    location="A", max_participants=5)
        # both set -> violates XOR
        with self.assertRaises(IntegrityError), transaction.atomic():
            Session.objects.create(group=g, individual_student=st, **base)
        # neither set -> also violates
        with self.assertRaises(IntegrityError), transaction.atomic():
            Session.objects.create(group=None, individual_student=None, **base)

    @skipUnless(connection.vendor == "postgresql",
                "GIST exclusion against trainer overlap is PostgreSQL-only (NOTE-2)")
    def test_db_rejects_trainer_overlap_bypassing_app_check(self):
        # Inserts overlapping sessions DIRECTLY (skipping check_trainer_conflict) to
        # prove the DB itself blocks races via the excl_trainer_time_overlap constraint.
        tr = f.make_trainer(); g = f.make_group()
        Session.objects.create(trainer=tr, group=g, start_at=f.dt(2026, 6, 1, 17),
                               end_at=f.dt(2026, 6, 1, 18), location="A", max_participants=5)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Session.objects.create(trainer=tr, group=g, start_at=f.dt(2026, 6, 1, 17, 30),
                                   end_at=f.dt(2026, 6, 1, 18, 30), location="B",
                                   max_participants=5)


class FamilyAccountRule(TestCase):
    """Rule 7: one parent -> many students; attendance/sub attach to student."""
    def test_parent_many_children(self):
        parent = f.make_parent()
        a = f.make_student(parent=parent, first="Аня", last="К")
        b = f.make_student(parent=parent, first="Боря", last="К")
        self.assertEqual(parent.students.count(), 2)
        self.assertEqual(a.parent, b.parent)

    def test_identity_client_trainer_and_participant_admin_disable_hard_delete(self):
        from django.contrib.admin.sites import AdminSite

        from accounts.admin import ParentAccountAdmin, TrainerAdmin, UserAdmin
        from accounts.models import ParentAccount, Trainer, User
        from students.admin import StudentAdmin
        from students.models import Student

        parent = f.make_parent()
        trainer = f.make_trainer()
        student = f.make_student(parent=parent)

        self.assertFalse(UserAdmin(User, AdminSite()).has_delete_permission(None, parent.user))
        self.assertFalse(ParentAccountAdmin(ParentAccount, AdminSite()).has_delete_permission(None, parent))
        self.assertFalse(TrainerAdmin(Trainer, AdminSite()).has_delete_permission(None, trainer))
        self.assertFalse(StudentAdmin(Student, AdminSite()).has_delete_permission(None, student))


class BillingRule(TestCase):
    """Rules 8 & 9: balance = charges - confirmed payments; pending doesn't count."""
    def setUp(self):
        self.st = f.make_student()
        Charge.objects.create(student=self.st, description="Абонемент 8",
                              amount_minor=24000, currency="PLN", due_date=date(2026, 1, 5))

    def test_pending_payment_does_not_reduce_balance(self):
        Payment.objects.create(student=self.st, amount_minor=24000, currency="PLN",
                               paid_at=date(2026, 1, 4), status=PaymentStatus.PENDING)
        self.assertEqual(student_balance(self.st).amount_minor, 24000)  # still owed

    def test_confirmed_payment_reduces_balance(self):
        admin = f.make_admin()
        p = Payment.objects.create(student=self.st, amount_minor=24000, currency="PLN",
                                   paid_at=date(2026, 1, 4), status=PaymentStatus.PENDING)
        confirm_payment(p, admin)
        self.assertEqual(student_balance(self.st).amount_minor, 0)
        self.assertEqual(p.confirmed_by, admin)
        self.assertIsNotNone(p.confirmed_at)

    def test_final_payment_cannot_be_changed_to_the_opposite_state(self):
        admin = f.make_admin()
        confirmed = Payment.objects.create(
            student=self.st, amount_minor=1000, currency="PLN",
            paid_at=date.today(), status=PaymentStatus.PENDING)
        rejected = Payment.objects.create(
            student=self.st, amount_minor=1000, currency="PLN",
            paid_at=date.today(), status=PaymentStatus.PENDING)

        confirm_payment(confirmed, admin)
        reject_payment(rejected, admin, "not received")

        with self.assertRaises(ValidationError):
            reject_payment(confirmed, admin)
        with self.assertRaises(ValidationError):
            confirm_payment(rejected, admin)

    def test_payment_event_history_cannot_be_deleted(self):
        payment = Payment.objects.create(
            student=self.st, amount_minor=1000, currency="PLN",
            paid_at=date.today(), status=PaymentStatus.PENDING)
        event = PaymentEvent.objects.create(
            payment=payment,
            event_type=PaymentEventType.CREATED,
            to_status=PaymentStatus.PENDING,
            amount_minor=payment.amount_minor,
            currency=payment.currency,
        )

        with self.assertRaises(ValidationError):
            event.delete()
        with self.assertRaises(ValidationError):
            PaymentEvent.objects.filter(pk=event.pk).delete()
        transaction.set_rollback(False)
        self.assertTrue(PaymentEvent.objects.filter(pk=event.pk).exists())

    def test_payment_history_cannot_be_deleted(self):
        payment = Payment.objects.create(
            student=self.st,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.PENDING,
        )
        with self.assertRaises(ValidationError):
            payment.delete()
        with self.assertRaises(ValidationError):
            Payment.objects.filter(pk=payment.pk).delete()
        transaction.set_rollback(False)
        self.assertTrue(Payment.objects.filter(pk=payment.pk).exists())

    def test_charge_history_cannot_be_deleted(self):
        charge = Charge.objects.create(
            student=self.st,
            description="Correction charge",
            amount_minor=1000,
            currency="PLN",
            due_date=date.today(),
        )
        with self.assertRaises(ValidationError):
            charge.delete()
        with self.assertRaises(ValidationError):
            Charge.objects.filter(pk=charge.pk).delete()
        transaction.set_rollback(False)
        self.assertTrue(Charge.objects.filter(pk=charge.pk).exists())

    def test_payment_admin_locks_history_fields_and_delete(self):
        from django.contrib.admin.sites import AdminSite

        from billing.admin import PaymentAdmin

        payment = Payment.objects.create(
            student=self.st,
            amount_minor=1000,
            currency="PLN",
            paid_at=date.today(),
            status=PaymentStatus.PENDING,
        )
        payment_admin = PaymentAdmin(Payment, AdminSite())

        readonly = set(payment_admin.get_readonly_fields(request=None, obj=payment))

        self.assertFalse(payment_admin.has_delete_permission(request=None, obj=payment))
        self.assertTrue({
            "student", "amount_minor", "currency", "paid_at", "method", "status",
            "created_by", "confirmed_by", "confirmed_at",
        }.issubset(readonly))

    def test_charge_admin_locks_history_fields_and_delete(self):
        from django.contrib.admin.sites import AdminSite

        from billing.admin import ChargeAdmin

        charge = Charge.objects.create(
            student=self.st,
            description="Admin locked charge",
            amount_minor=1000,
            currency="PLN",
            due_date=date.today(),
        )
        charge_admin = ChargeAdmin(Charge, AdminSite())

        readonly = set(charge_admin.get_readonly_fields(request=None, obj=charge))

        self.assertFalse(charge_admin.has_delete_permission(request=None, obj=charge))
        self.assertTrue({
            "student", "subscription", "description", "amount_minor", "currency",
            "due_date", "created_by", "created_at",
        }.issubset(readonly))

    def test_partial_and_overdue_status(self):
        admin = f.make_admin()
        p = Payment.objects.create(student=self.st, amount_minor=10000, currency="PLN",
                                   paid_at=date(2026, 1, 4), status=PaymentStatus.PENDING)
        confirm_payment(p, admin)
        cs = charge_statuses(self.st)[0]
        self.assertTrue(cs.is_partial)
        self.assertEqual(cs.label, "Частично оплачено")


class ReceiptRetentionRule(TestCase):
    """Rule 10: receipt files auto-deleted after 30 days; Payment survives."""
    def test_purge_scrubs_old_receipt_keeps_payment(self):
        st = f.make_student(); admin = f.make_admin()
        p = Payment.objects.create(student=st, amount_minor=24000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.CONFIRMED,
                                   confirmed_by=admin, confirmed_at=timezone.now())
        old = ReceiptFile.objects.create(payment=p, uploaded_at=timezone.now() - timedelta(days=31))
        fresh = ReceiptFile.objects.create(payment=p, uploaded_at=timezone.now() - timedelta(days=2))
        scrubbed = purge_expired_receipts()
        old.refresh_from_db(); fresh.refresh_from_db()
        self.assertEqual(scrubbed, 1)
        self.assertTrue(old.is_deleted)
        self.assertFalse(fresh.is_deleted)
        self.assertTrue(Payment.objects.filter(pk=p.pk).exists())  # accounting doc kept


class NotificationSmsRule(TestCase):
    """Rule 5.6: SMS templates: no Polish diacritics and < 160 chars."""
    def test_diacritics_rejected(self):
        with self.assertRaises(ValidationError):
            validate_sms_template("Przypomnienie o płatności do piątku")

    def test_too_long_rejected(self):
        with self.assertRaises(ValidationError):
            validate_sms_template("x" * 160)

    def test_clean_ascii_ok(self):
        validate_sms_template("Przypomnienie o platnosci do piatku. Prosimy uregulowac.")


class ConsentRule(TestCase):
    """RODO: consent is grantable/revocable per channel."""
    def test_grant_and_revoke(self):
        parent = f.make_parent()
        c = Consent.objects.create(parent=parent, type=ConsentType.EMAIL)
        c.grant(policy_version="v1")
        self.assertTrue(c.is_active)
        c.revoke()
        self.assertFalse(c.is_active)
