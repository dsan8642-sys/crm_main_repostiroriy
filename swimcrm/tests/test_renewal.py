"""Decision #1: renewal carries remaining sessions over (they never burn), and a
date-expired subscription that still has a positive balance remains usable."""
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from audit.models import AuditLogEntry
from scheduling.services import create_session
from subscriptions.models import SubscriptionStatus
from subscriptions.services import (create_subscription, manual_adjust,
                                    renew_subscription)

from . import factories as f


class RenewalRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.student = f.make_student()
        self.type8 = f.make_sub_type(name="Абонемент 8", sessions=8, days=30)

    def test_renew_carries_over_remaining(self):
        sub = create_subscription(student=self.student, subscription_type=self.type8,
                                  start_date=date.today(), created_by=self.admin)
        manual_adjust(subscription=sub, delta=-3, created_by=self.admin, note="исп. 3")
        self.assertEqual(sub.remaining_sessions, 5)

        new_sub = renew_subscription(subscription=sub, created_by=self.admin)
        sub.refresh_from_db()
        self.assertEqual(new_sub.remaining_sessions, 13)   # 5 carried + 8 purchased
        self.assertEqual(sub.remaining_sessions, 0)        # old ledger zeroed
        self.assertEqual(sub.status, SubscriptionStatus.EXPIRED)

    def test_renew_to_unlimited_retires_finite_balance(self):
        unlim = f.make_unlimited_type()
        sub = create_subscription(student=self.student, subscription_type=self.type8,
                                  start_date=date.today(), created_by=self.admin)
        new_sub = renew_subscription(subscription=sub, subscription_type=unlim,
                                     created_by=self.admin)
        sub.refresh_from_db()
        self.assertIsNone(new_sub.remaining_sessions)  # unlimited: no counter
        self.assertEqual(sub.remaining_sessions, 0)    # old leftover retired

    def test_attend_on_expired_subscription_with_balance_deducts(self):
        sub = create_subscription(student=self.student, subscription_type=self.type8,
                                  start_date=date.today() - timedelta(days=60),
                                  created_by=self.admin)
        self.assertLess(sub.effective_end_date, date.today())  # expired by date
        self.assertEqual(sub.remaining_sessions, 8)

        now = timezone.now()
        sess = create_session(trainer=f.make_trainer(), start_at=now,
                              end_at=now + timedelta(hours=1), location="A",
                              max_participants=10, group=f.make_group())
        set_attendance(session_id=sess.id, student=self.student,
                       status=AttendanceStatus.PRESENT)
        sub.refresh_from_db()
        self.assertEqual(sub.remaining_sessions, 7)  # deducted despite being expired

    def test_status_change_reverts_on_same_expired_subscription(self):
        sub = create_subscription(student=self.student, subscription_type=self.type8,
                                  start_date=date.today() - timedelta(days=60),
                                  created_by=self.admin)
        now = timezone.now()
        sess = create_session(trainer=f.make_trainer(), start_at=now,
                              end_at=now + timedelta(hours=1), location="A",
                              max_participants=10, group=f.make_group())
        set_attendance(session_id=sess.id, student=self.student, status=AttendanceStatus.PRESENT)
        self.assertEqual(sub.remaining_sessions, 7)
        # excused -> compensating +1 posted to the same subscription
        set_attendance(session_id=sess.id, student=self.student, status=AttendanceStatus.EXCUSED)
        self.assertEqual(sub.remaining_sessions, 8)

    def test_renew_is_audited(self):
        sub = create_subscription(student=self.student, subscription_type=self.type8,
                                  start_date=date.today(), created_by=self.admin)
        renew_subscription(subscription=sub, created_by=self.admin)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="subscription.renewed", actor=self.admin).exists())
