"""Per-visit billing (group price) and session deletion guards."""
from datetime import date

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.test import TestCase

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentStatus
from billing.services import charge_statuses, student_balance
from django.utils import timezone
from analytics.debtors import debtors
from analytics.reports import unpaid_charges
from notifications.services import _collect_payment_reminder
from payroll.models import (PayrollCalculation, PayrollPeriod, PayrollRule,
                            PayrollScheme)
from scheduling.models import Session, SessionType
from scheduling.services import create_session, delete_session
from subscriptions.models import FreezePeriod, SubscriptionStatus
from subscriptions.services import create_subscription

from . import factories as f


class VisitChargeRule(TestCase):
    """A visit nobody's subscription paid for is billed at the group price."""

    def setUp(self):
        self.admin = f.make_admin()
        self.trainer = f.make_trainer()
        self.group = f.make_group(name="Дельфины")
        self.group.price_minor = 5000  # 50,00 PLN per session
        self.group.currency = "PLN"
        self.group.save(update_fields=["price_minor", "currency"])
        self.student = f.make_student(group=self.group)
        self.session = create_session(
            group=self.group, trainer=self.trainer,
            start_at=f.dt(2026, 6, 1, 17), end_at=f.dt(2026, 6, 1, 18),
            location="Бассейн A", max_participants=10, actor=self.admin)

    def _charged(self):
        return Charge.objects.filter(student=self.student).aggregate(
            total=Sum("amount_minor"))["total"] or 0

    def test_present_without_subscription_is_charged_group_price(self):
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 5000)
        charge = Charge.objects.get(student=self.student)
        self.assertEqual(charge.currency, "PLN")
        self.assertEqual(charge.due_date, self.session.start_at.date())

    def test_clearing_visit_reverses_charge_without_deleting_history(self):
        record = set_attendance(session_id=self.session.id, student=self.student,
                                status=AttendanceStatus.PRESENT, actor=self.admin)
        self.assertEqual(self._charged(), 5000)

        set_attendance(session_id=self.session.id, student=self.student,
                       status=None, actor=self.admin)
        self.assertEqual(self._charged(), 0)
        self.assertEqual(list(record.charges.order_by("id").values_list("amount_minor", flat=True)), [5000, -5000])

    def test_subscription_covers_the_visit_so_no_money_is_charged(self):
        create_subscription(student=self.student, subscription_type=f.make_sub_type(),
                            start_date=f.dt(2026, 5, 1, 9).date(), created_by=self.admin)

        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 0)

    def test_unlimited_coverage_uses_session_date_status_and_freeze_extension(self):
        unlimited_type = f.make_unlimited_type()
        cases = [
            (date(2026, 5, 15), SubscriptionStatus.ACTIVE, False, True),
            (date(2026, 6, 2), SubscriptionStatus.ACTIVE, False, False),
            (date(2026, 4, 25), SubscriptionStatus.ACTIVE, False, True),
            (date(2026, 4, 23), SubscriptionStatus.ACTIVE, False, False),
            (date(2026, 4, 23), SubscriptionStatus.FROZEN, True, True),
            (date(2026, 5, 15), SubscriptionStatus.CANCELLED, False, False),
            (date(2026, 5, 15), SubscriptionStatus.EXPIRED, False, False),
        ]
        for index, (start, status, frozen, covered) in enumerate(cases):
            with self.subTest(start=start, status=status, frozen=frozen):
                student = f.make_student(group=self.group, first=f"Unlimited {index}")
                sub = create_subscription(student=student, subscription_type=unlimited_type,
                                          start_date=start)
                sub.status = status
                sub.save(update_fields=["status"])
                if frozen:
                    FreezePeriod.objects.create(subscription=sub, start_date=date(2026, 5, 1),
                                                end_date=date(2026, 5, 2))
                record = set_attendance(session_id=self.session.id, student=student,
                                        status=AttendanceStatus.PRESENT, actor=self.admin)
                self.assertFalse(record.ledger_entries.exists())
                self.assertEqual(list(record.charges.values_list("amount_minor", flat=True)),
                                 [] if covered else [5000])

    def test_unlimited_reconciles_old_charge_and_preserves_counted_balance(self):
        record = set_attendance(session_id=self.session.id, student=self.student,
                                status=AttendanceStatus.PRESENT, actor=self.admin)
        self.assertEqual(self._charged(), 5000)
        create_subscription(student=self.student, subscription_type=f.make_unlimited_type(),
                            start_date=date(2026, 5, 15))
        counted = create_subscription(student=self.student, subscription_type=f.make_sub_type(),
                                      start_date=date(2026, 5, 1))
        for status in (AttendanceStatus.PRESENT, AttendanceStatus.PRESENT,
                       AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED,
                       AttendanceStatus.RESCHEDULED, AttendanceStatus.PRESENT):
            with self.subTest(status=status):
                set_attendance(session_id=self.session.id, student=self.student,
                               status=status, actor=self.admin)
                self.assertEqual(self._charged(), 0)
                self.assertFalse(record.ledger_entries.exists())
                self.assertEqual(counted.remaining_sessions, 8)
        self.assertEqual(list(record.charges.order_by("id").values_list("amount_minor", flat=True)),
                         [5000, -5000])

    def test_absent_without_subscription_is_charged_group_price(self):
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.ABSENT, actor=self.admin)

        self.assertEqual(self._charged(), 5000)

    def test_group_without_price_is_never_charged(self):
        self.group.price_minor = None
        self.group.save(update_fields=["price_minor"])
        session = create_session(
            group=self.group, trainer=self.trainer,
            start_at=f.dt(2026, 6, 4, 17), end_at=f.dt(2026, 6, 4, 18),
            location="Бассейн A", max_participants=10, actor=self.admin)

        set_attendance(session_id=session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 0)

    def test_session_keeps_price_snapshot_when_group_tariff_changes(self):
        self.assertEqual(self.session.price_minor, 5000)
        self.assertEqual(self.session.currency, "PLN")
        self.group.price_minor = 7500
        self.group.currency = "EUR"
        self.group.save(update_fields=["price_minor", "currency"])

        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        charge = Charge.objects.get(student=self.student)
        self.assertEqual(charge.amount_minor, 5000)
        self.assertEqual(charge.currency, "PLN")
        self.session.refresh_from_db()
        self.assertEqual(self.session.price_minor, 5000)
        self.assertEqual(self.session.currency, "PLN")

    def test_repeated_marking_does_not_duplicate_the_charge(self):
        for _ in range(3):
            set_attendance(session_id=self.session.id, student=self.student,
                           status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 5000)
        self.assertEqual(Charge.objects.filter(student=self.student).count(), 1)

    def test_status_change_away_from_present_posts_a_reversal(self):
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)
        self.group.price_minor = 8000
        self.group.currency = "EUR"
        self.group.save(update_fields=["price_minor", "currency"])

        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.EXCUSED, actor=self.admin)

        # Charges are immutable, so the original row stays and is compensated.
        self.assertEqual(self._charged(), 0)
        self.assertEqual(Charge.objects.filter(student=self.student).count(), 2)
        self.assertTrue(Charge.objects.filter(student=self.student,
                                              amount_minor=-5000).exists())
        self.assertEqual(
            set(Charge.objects.filter(student=self.student).values_list(
                "currency", flat=True)),
            {"PLN"},
        )

    def test_visit_reversal_clears_status_api_report_and_reminders(self):
        self.client.force_login(self.student.parent.user)
        record = set_attendance(session_id=self.session.id, student=self.student,
                                status=AttendanceStatus.PRESENT, actor=self.admin)
        original = record.charges.get()
        for status in (AttendanceStatus.EXCUSED, AttendanceStatus.PRESENT,
                       AttendanceStatus.RESCHEDULED):
            with self.subTest(status=status):
                set_attendance(session_id=self.session.id, student=self.student,
                               status=status, actor=self.admin)
                restored = status == AttendanceStatus.PRESENT
                allocations = charge_statuses(self.student)
                self.assertTrue(next(row for row in allocations
                                     if row.charge.id == original.id).is_reversed)
                unpaid = [row for row in allocations if not row.is_paid]
                self.assertEqual(len(unpaid), int(restored))
                self.assertEqual(student_balance(self.student).amount_minor,
                                 5000 if restored else 0)
                self.assertEqual(len(unpaid_charges()), int(restored))
                self.assertEqual(len(list(_collect_payment_reminder(timezone.now()))),
                                 int(restored))
                response = self.client.get('/api/client/charges/',
                                           {'participant_id': self.student.id})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['summary']['unpaid_minor'],
                                 5000 if restored else 0)
                original_payload = next(row for row in response.json()['charges']
                                        if row['id'] == original.id)
                self.assertEqual(original_payload['status'], 'reversed')
                payments = self.client.get('/api/client/payments/',
                                           {'participant_id': self.student.id})
                self.assertEqual(payments.status_code, 200)
                original_history = next(row for row in payments.json()['charges']
                                        if row['id'] == original.id)
                self.assertEqual(original_history['status'], 'reversed')
                self.assertEqual(original_history['outstanding_minor'], 0)
                filtered = self.client.get('/api/client/charges/',
                                          {'participant_id': self.student.id, 'status': 'overdue'})
                self.assertEqual(len(filtered.json()['charges']), int(restored))

    def test_visit_reversal_keeps_payments_for_other_charges(self):
        record = set_attendance(session_id=self.session.id, student=self.student,
                                status=AttendanceStatus.PRESENT, actor=self.admin)
        other = Charge.objects.create(student=self.student, description='Other obligation',
                                      amount_minor=7000, currency='PLN', due_date=date(2026, 6, 2))
        Payment.objects.create(student=self.student, amount_minor=2000, currency='PLN',
                               paid_at=date(2026, 6, 1), status=PaymentStatus.CONFIRMED)
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.EXCUSED, actor=self.admin)
        allocations = {row.charge.id: row for row in charge_statuses(self.student)}
        self.assertTrue(allocations[record.charges.order_by('id').first().id].is_reversed)
        self.assertEqual(allocations[other.id].paid_minor, 2000)
        self.assertEqual(student_balance(self.student).amount_minor, 5000)
        self.assertEqual(debtors()[0].oldest_due_date, other.due_date)

    def test_partial_visit_compensation_preserves_remaining_debt_and_currency(self):
        record = set_attendance(session_id=self.session.id, student=self.student,
                                status=AttendanceStatus.PRESENT, actor=self.admin)
        Charge.objects.create(student=self.student, attendance=record, description='Partial correction',
                              amount_minor=-2000, currency='PLN', due_date=date(2026, 6, 1))
        Charge.objects.create(student=self.student, attendance=record, description='Other currency',
                              amount_minor=-5000, currency='EUR', due_date=date(2026, 6, 1))
        Payment.objects.create(student=self.student, amount_minor=1000, currency='PLN',
                               paid_at=date(2026, 6, 1), status=PaymentStatus.CONFIRMED)
        original = charge_statuses(self.student)[0]
        self.assertFalse(original.is_reversed)
        self.assertTrue(original.is_overdue)
        self.assertEqual(original.paid_minor, 3000)
        self.assertEqual(student_balance(self.student).amount_minor, 2000)

    def test_reversal_is_re_billed_when_the_visit_is_restored(self):
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.EXCUSED, actor=self.admin)

        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 5000)

    def test_individual_session_without_a_group_is_not_charged(self):
        solo = f.make_student(group=None, first="Соло", last="Пловец")
        session = create_session(
            individual_student=solo, session_type=SessionType.INDIVIDUAL,
            trainer=self.trainer, start_at=f.dt(2026, 6, 2, 17),
            end_at=f.dt(2026, 6, 2, 18), location="Бассейн A",
            max_participants=1, actor=self.admin)

        set_attendance(session_id=session.id, student=solo,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(Charge.objects.filter(student=solo).count(), 0)


class SessionDeletionRule(TestCase):
    """Deletion is for mistakes only; a class that happened is cancelled instead."""

    def setUp(self):
        self.admin = f.make_admin()
        self.trainer = f.make_trainer()
        self.group = f.make_group(name="Касатки")
        self.student = f.make_student(group=self.group)
        self.session = create_session(
            group=self.group, trainer=self.trainer,
            start_at=f.dt(2030, 6, 3, 17), end_at=f.dt(2030, 6, 3, 18),
            location="Бассейн A", max_participants=10, actor=self.admin)

    def test_empty_session_is_deleted(self):
        pk = self.session.pk

        session_id = delete_session(self.session, actor=self.admin, force=True)

        self.assertEqual(session_id, pk)
        self.assertFalse(Session.objects.filter(pk=pk).exists())

    def test_session_with_attendance_is_refused(self):
        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        with self.assertRaises(ValidationError):
            delete_session(self.session, actor=self.admin)

        self.assertTrue(Session.objects.filter(pk=self.session.pk).exists())

    def test_session_with_payroll_is_refused(self):
        scheme = PayrollScheme.objects.create(name="Базовая")
        rule = PayrollRule.objects.create(
            scheme=scheme, session_type=SessionType.GROUP, base_amount_minor=10000)
        period = PayrollPeriod.objects.create(
            date_from=f.dt(2026, 6, 1, 0).date(), date_to=f.dt(2026, 6, 30, 0).date())
        PayrollCalculation.objects.create(
            period=period, session=self.session, trainer=self.trainer, rule=rule,
            attended_clients_count=0, base_amount_minor=10000,
            extra_amount_minor=0, final_amount_minor=10000)

        with self.assertRaises(ValidationError):
            delete_session(self.session, actor=self.admin)
