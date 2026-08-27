"""Per-visit billing (group price) and session deletion guards."""
from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.test import TestCase

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge
from payroll.models import (PayrollCalculation, PayrollPeriod, PayrollRule,
                            PayrollScheme)
from scheduling.models import Session, SessionType
from scheduling.services import create_session, delete_session
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

    def test_subscription_covers_the_visit_so_no_money_is_charged(self):
        create_subscription(student=self.student, subscription_type=f.make_sub_type(),
                            start_date=f.dt(2026, 5, 1, 9).date(), created_by=self.admin)

        set_attendance(session_id=self.session.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)

        self.assertEqual(self._charged(), 0)

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
