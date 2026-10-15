"""Reassigning visits moves charges/visits, never cash receipts."""
from datetime import date
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.test import TestCase

from analytics.reports import income_for_period
from attendance.models import AttendanceStatus
from attendance.services import attendance_payment, change_attendance_payment, set_attendance
from billing.models import Charge, Payment, PaymentStatus
from billing.services import student_balance
from scheduling.services import create_session
from subscriptions.models import SubscriptionStatus
from subscriptions.services import can_assign_attendance, create_subscription, freeze_subscription, manual_adjust, update_subscription_dates

from . import factories as f


class AttendancePaymentTests(TestCase):
    def setUp(self):
        today = patch("subscriptions.services.timezone.localdate", return_value=date(2026, 6, 20))
        today.start()
        self.addCleanup(today.stop)
        self.admin = f.make_admin()
        self.trainer = f.make_trainer()
        self.student = f.make_student()
        group = f.make_group()
        group.price_minor = 5000
        group.save(update_fields=["price_minor"])
        self.records = []
        for day in (1, 2):
            session = create_session(
                group=group, trainer=self.trainer,
                start_at=f.dt(2026, 6, day, 17), end_at=f.dt(2026, 6, day, 18),
                location="Pool", max_participants=10, actor=self.admin)
            self.records.append(set_attendance(
                session_id=session.id, student=self.student,
                status=AttendanceStatus.PRESENT, actor=self.admin))
        self.sub = create_subscription(
            student=self.student, subscription_type=f.make_sub_type(sessions=1),
            start_date=date(2026, 6, 10), created_by=self.admin)
        self.ids = [record.id for record in self.records]

    def change(self, source, ids=None, subscription_id=None):
        return change_attendance_payment(
            student=self.student, attendance_ids=self.ids if ids is None else ids,
            source=source, subscription_id=subscription_id, actor=self.admin)

    def net_charge(self):
        return Charge.objects.filter(attendance_id__in=self.ids).aggregate(
            total=Sum("amount_minor"))["total"] or 0

    def test_late_subscription_covers_earlier_visits_and_can_go_negative_without_changing_cash(self):
        Charge.objects.create(student=self.student, subscription=self.sub,
                              amount_minor=24000, currency="PLN", due_date=date(2026, 6, 10))
        payment = Payment.objects.create(
            student=self.student, amount_minor=24000, currency="PLN",
            paid_at=date(2026, 6, 10), status=PaymentStatus.CONFIRMED)
        self.assertEqual(student_balance(self.student).amount_minor, 10000)
        self.change("subscription")  # The sole subscription is selected automatically.
        self.assertEqual(self.sub.remaining_sessions, -1)
        self.assertEqual(self.net_charge(), 0)
        self.assertEqual(student_balance(self.student).amount_minor, 0)
        self.assertEqual(income_for_period(date(2026, 6, 1), date(2026, 6, 30)).amount_minor, 24000)
        self.assertEqual(Payment.objects.count(), 1)
        payment.refresh_from_db()
        self.assertEqual(payment.paid_at, date(2026, 6, 10))
        counts = (Charge.objects.count(), self.sub.ledger_entries.count())
        self.change("subscription")
        self.assertEqual(counts, (Charge.objects.count(), self.sub.ledger_entries.count()))

    def test_switch_back_restores_visits_and_keeps_account_source_after_trainer_edits(self):
        self.change("subscription")
        self.change("account", ids=[self.ids[0]])
        self.assertEqual(self.sub.remaining_sessions, 0)
        self.assertEqual(self.net_charge(), 5000)
        for status in (AttendanceStatus.EXCUSED, None, AttendanceStatus.PRESENT, AttendanceStatus.ABSENT):
            record = set_attendance(session_id=self.records[0].session_id,
                                    student=self.student, status=status, actor=self.trainer.user)
            self.assertEqual(record.payment_source, "account")
            self.assertEqual(self.sub.remaining_sessions, 0)
            self.assertEqual(self.net_charge(), 5000 if record.deducts else 0)

    def test_selecting_another_subscription_restores_the_original_and_survives_status_changes(self):
        self.change("subscription")
        other = create_subscription(student=self.student, subscription_type=f.make_sub_type(name="Four visits", sessions=4),
                                    start_date=date(2026, 7, 1))
        with self.assertRaises(ValidationError):
            self.change("subscription")
        self.change("subscription", subscription_id=other.id)
        self.assertEqual(self.sub.remaining_sessions, 1)
        self.assertEqual(other.remaining_sessions, 2)
        for status in (AttendanceStatus.EXCUSED, AttendanceStatus.PRESENT):
            set_attendance(session_id=self.records[0].session_id,
                           student=self.student, status=status, actor=self.trainer.user)
        self.assertEqual(self.sub.remaining_sessions, 1)
        self.assertEqual(other.remaining_sessions, 2)
        unlimited = create_subscription(student=self.student, subscription_type=f.make_unlimited_type(),
                                        start_date=date(2026, 7, 1))
        self.change("subscription", subscription_id=unlimited.id)
        self.assertEqual(other.remaining_sessions, 4)
        self.assertEqual(self.net_charge(), 0)

    def test_invalid_member_of_batch_rolls_back_every_visit(self):
        set_attendance(session_id=self.records[1].session_id, student=self.student,
                       status=AttendanceStatus.EXCUSED)
        with self.assertRaises(ValidationError):
            self.change("subscription")
        self.assertEqual(self.sub.remaining_sessions, 1)
        self.assertEqual(self.net_charge(), 5000)
        self.records[0].refresh_from_db()
        self.assertEqual(self.records[0].payment_source, "")
        with self.assertRaises(ValidationError):
            self.change("subscription", ids=[self.ids[0], 999999])
        foreign = create_subscription(student=f.make_student(), subscription_type=self.sub.subscription_type,
                                      start_date=date(2026, 6, 1))
        with self.assertRaises(ValidationError):
            self.change("subscription", ids=[self.ids[0]], subscription_id=foreign.id)

    def test_assignment_eligibility_uses_effective_end_or_positive_balance(self):
        unlimited_type = f.make_unlimited_type()
        expected = {}
        for end, remaining, status, unlimited, frozen, allowed in (
            (19, 0, SubscriptionStatus.ACTIVE, False, False, False),
            (19, -1, SubscriptionStatus.ACTIVE, False, False, False),
            (19, 2, SubscriptionStatus.EXPIRED, False, False, True),
            (20, 0, SubscriptionStatus.ACTIVE, False, False, True),
            (21, -1, SubscriptionStatus.ACTIVE, False, False, True),
            (21, 2, SubscriptionStatus.CANCELLED, False, False, False),
            (19, 0, SubscriptionStatus.FROZEN, False, True, True),
            (19, None, SubscriptionStatus.ACTIVE, True, False, False),
            (20, None, SubscriptionStatus.ACTIVE, True, False, True),
        ):
            subscription = create_subscription(
                student=self.student, subscription_type=unlimited_type if unlimited else self.sub.subscription_type,
                start_date=date(2026, 5, 1))
            subscription.base_end_date = date(2026, 6, end)
            subscription.status = status
            subscription.save(update_fields=["base_end_date", "status"])
            if not unlimited and remaining != 1:
                manual_adjust(subscription=subscription, delta=remaining - 1)
            if frozen:
                freeze_subscription(subscription=subscription, start_date=date(2026, 6, 10),
                                    end_date=date(2026, 6, 11))
            self.assertEqual(can_assign_attendance(subscription), allowed)
            expected[subscription.id] = allowed
        self.client.force_login(self.admin)
        detail = self.client.get(f"/api/admin/clients/{self.student.parent_id}/").json()
        actual = {row["id"]: row["can_assign_attendance"] for row in detail["subscriptions"]}
        self.assertEqual({key: actual[key] for key in expected}, expected)

    def test_old_empty_subscription_is_not_an_automatic_or_explicit_choice(self):
        old = create_subscription(student=self.student, subscription_type=self.sub.subscription_type,
                                  start_date=date(2026, 5, 1))
        manual_adjust(subscription=old, delta=-1)
        self.change("subscription")
        self.assertEqual(self.sub.remaining_sessions, -1)
        with self.assertRaises(ValidationError):
            self.change("subscription", subscription_id=old.id)
        self.assertEqual(old.remaining_sessions, 0)
        self.assertEqual(self.sub.remaining_sessions, -1)
        manual_adjust(subscription=old, delta=2)
        self.change("subscription", subscription_id=old.id)
        self.assertEqual(old.remaining_sessions, 0)
        self.assertEqual(self.sub.remaining_sessions, 1)

    def test_explicit_source_can_enable_selected_history_without_enabling_other_visits(self):
        history = []
        for day in (3, 4):
            session = create_session(
                group=self.records[0].session.group, trainer=self.trainer,
                start_at=f.dt(2026, 6, day, 17), end_at=f.dt(2026, 6, day, 18),
                location="Pool", max_participants=10, actor=self.admin)
            record = set_attendance(session_id=session.id, student=self.student,
                                    status=AttendanceStatus.PRESENT, apply_financial_effects=False)
            history.append(record)
        set_attendance(session_id=history[0].session_id, student=self.student,
                       status=AttendanceStatus.ABSENT, actor=self.trainer.user)
        history[0].refresh_from_db()
        self.assertFalse(history[0].financial_effects_enabled)
        self.assertFalse(history[0].charges.exists())
        self.change("subscription", ids=[history[0].id])
        history[0].refresh_from_db()
        history[1].refresh_from_db()
        self.assertTrue(history[0].financial_effects_enabled)
        self.assertFalse(history[1].financial_effects_enabled)
        self.assertEqual(self.sub.remaining_sessions, 0)
        self.assertEqual(attendance_payment(history[0]), ("subscription", self.sub.id))
        self.assertEqual(student_balance(self.student).amount_minor, 10000)
        self.change("account", ids=[history[1].id])
        history[1].refresh_from_db()
        self.assertTrue(history[1].financial_effects_enabled)
        self.assertEqual(student_balance(self.student).amount_minor, 15000)
        self.change("account", ids=[history[1].id])
        self.assertEqual(student_balance(self.student).amount_minor, 15000)
        self.assertFalse(Payment.objects.exists())

    def test_legacy_sources_and_admin_endpoint_authorization_and_readback(self):
        self.assertEqual(attendance_payment(self.records[0]), ("account", None))
        path = f"/api/admin/participants/{self.student.id}/attendance/payment/"
        data = {"attendance_ids": self.ids, "source": "subscription"}
        for user in (self.student.parent.user, self.trainer.user):
            self.client.force_login(user)
            self.assertEqual(self.client.post(path, data, content_type="application/json").status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.post(path, [], content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(path, {**data, "attendance_ids": [True]},
                                          content_type="application/json").status_code, 400)
        response = self.client.post(path, data, content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(all(row["payment_subscription_id"] == self.sub.id
                            for row in response.json()["attendance"]))
        self.assertTrue(all(row["subscription_session_delta"] == -1
                            for row in response.json()["attendance"]))
        detail = self.client.get(f"/api/admin/clients/{self.student.parent_id}/").json()
        self.assertTrue(all(row["payment_source"] == "subscription" for row in detail["attendance"]))

    def test_dates_are_independent_preserve_freezes_and_do_not_rebill_visits(self):
        freeze_subscription(subscription=self.sub, start_date=date(2026, 6, 20),
                            end_date=date(2026, 6, 22))
        original_end = self.sub.effective_end_date
        changed = update_subscription_dates(subscription=self.sub, start_date=date(2026, 6, 1),
                                            created_by=self.admin, reason="Incorrect start")
        self.assertEqual(changed.effective_end_date, original_end)
        self.assertEqual(changed.total_frozen_days, 3)
        self.assertEqual(self.net_charge(), 10000)
        self.client.force_login(self.admin)
        path = f"/api/admin/subscriptions/{self.sub.id}/update/"
        data = {"start_date": "2026-05-01", "effective_end_date": "2026-05-31", "reason": "Incorrect dates"}
        response = self.client.post(path, data, content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["start_date"], "2026-05-01")
        self.assertEqual(response.json()["effective_end_date"], "2026-05-31")
        self.assertEqual(response.json()["end_date_changes"][0]["current_start"], "2026-05-01")
        response = self.client.post(path, {"start_date": "2026-06-01", "remaining_sessions": 8,
                                          "reason": "Invalid start"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.start_date, date(2026, 5, 1))
        self.assertEqual(self.sub.remaining_sessions, 1)
