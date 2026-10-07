import json
from threading import Barrier, Thread
from datetime import timedelta
from unittest import skipUnless

from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection
from django.core import mail
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus
from catalog.models import Group
from scheduling.models import SessionParticipant, SessionParticipantStatus, WaitlistEntry, WaitlistStatus
from scheduling.services import (change_client_booking, change_client_waitlist,
    create_session, session_roster_students)
from notifications.services import _collect_session_reminder
from notifications.models import (Channel, DeliveryStatus, EventType, NotificationLog,
    NotificationRule, NotificationTemplate, NotificationTemplateTranslation)
from accounts.models import Consent, ConsentType
from subscriptions.models import LedgerReason, SessionLedgerEntry, Subscription, SubscriptionStatus
from billing.models import Payment, ReceiptFile

from . import factories as f


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class SelfBookingTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("booking_admin")
        self.group = f.make_group("Masters booking")
        self.trainer = f.make_trainer("booking_trainer")
        self.students = [f.make_student(group=self.group) for _ in range(30)]
        self.start = timezone.now() + timedelta(days=2)
        self.session = create_session(
            group=self.group, trainer=self.trainer, start_at=self.start,
            duration_minutes=60, location="Pool", max_participants=15,
        )
        self.admin_client = Client()
        self.admin_client.force_login(self.admin)

    def post(self, client, path, data):
        return client.post(path, json.dumps(data), content_type="application/json")

    def test_group_mode_preserves_history_and_client_books_only_own_place(self):
        self.assertEqual(session_roster_students(self.session).count(), 30)
        saved = self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True, "booking_cutoff_hours": 8,
        })
        self.assertEqual(saved.status_code, 200)
        self.session.refresh_from_db()
        self.assertTrue(self.session.requires_booking)
        self.assertEqual(session_roster_students(self.session).count(), 0)

        waiting_client = Client()
        waiting_client.force_login(self.students[15].parent.user)
        schedule = waiting_client.get(f"/api/client/schedule/?student_id={self.students[15].id}").json()
        row = next(item for item in schedule["sessions"] if item["id"] == self.session.id)
        self.assertEqual(row["booking_status"], "available")
        self.assertEqual(row["free_places"], 15)

        for student in self.students[:15]:
            client = Client()
            client.force_login(student.parent.user)
            path = f"/api/client/schedule/sessions/{self.session.id}/booking/"
            response = self.post(client, path, {"student_id": student.id})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(session_roster_students(self.session).count(), 15)
        self.assertEqual(SessionParticipant.objects.filter(
            session=self.session, status=SessionParticipantStatus.ACTIVE).count(), 15)

        path = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        self.assertEqual(self.post(waiting_client, path, {"student_id": self.students[15].id}).status_code, 400)
        self.assertEqual(self.post(waiting_client, path, {"student_id": self.students[0].id}).status_code, 404)
        schedule = waiting_client.get(f"/api/client/schedule/?student_id={self.students[15].id}").json()
        row = next(item for item in schedule["sessions"] if item["id"] == self.session.id)
        self.assertEqual(row["booking_status"], "full")

        first = Client()
        first.force_login(self.students[0].parent.user)
        self.assertEqual(first.delete(path, json.dumps({"student_id": self.students[0].id}), content_type="application/json").status_code, 200)
        self.assertEqual(self.post(waiting_client, path, {"student_id": self.students[15].id}).status_code, 200)

        disabled = self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": False,
        }).json()
        self.assertEqual(disabled["booking_excluded_sessions"], 1)
        self.session.refresh_from_db()
        self.assertTrue(self.session.requires_booking)
        self.assertEqual(session_roster_students(self.session).count(), 15)

    def test_disabling_group_booking_preserves_waitlist_exit(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True,
        })
        student = self.students[0]
        WaitlistEntry.objects.create(session=self.session, student=student)
        disabled = self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": False,
        }).json()
        self.session.refresh_from_db()
        self.assertEqual(disabled["booking_excluded_sessions"], 1)
        self.assertTrue(self.session.requires_booking)

        client = Client()
        client.force_login(student.parent.user)
        path = f"/api/client/schedule/sessions/{self.session.id}/waitlist/"
        self.assertEqual(client.delete(path, json.dumps({"student_id": student.id}),
                                       content_type="application/json").status_code, 200)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=student).status,
                         WaitlistStatus.CANCELLED)

    def test_deadline_and_admin_exception(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True, "booking_cutoff_hours": 72,
        })
        self.session.refresh_from_db()
        client = Client()
        client.force_login(self.students[0].parent.user)
        path = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        self.assertEqual(self.post(client, path, {"student_id": self.students[0].id}).status_code, 400)
        added = self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/participants/", {
            "student_id": self.students[0].id,
        })
        self.assertEqual(added.status_code, 201)
        self.assertEqual(session_roster_students(self.session).count(), 1)
        AttendanceRecord.objects.create(
            session=self.session, student=self.students[0],
            status=AttendanceStatus.EXCUSED, marked_by=self.admin,
        )
        blocked = self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/participants/", {
            "student_id": self.students[1].id,
        })
        self.assertEqual(blocked.status_code, 400)

    def test_new_sessions_inherit_mode_and_existing_past_sessions_stay_legacy(self):
        past = create_session(
            group=self.group, trainer=self.trainer,
            start_at=timezone.now() - timedelta(days=2), duration_minutes=60,
            location="Pool", max_participants=30,
        )
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True,
        })
        past.refresh_from_db()
        self.assertFalse(past.requires_booking)
        self.assertEqual(session_roster_students(past).count(), 30)
        future = create_session(
            group=Group.objects.get(pk=self.group.id), trainer=self.trainer,
            start_at=self.start + timedelta(days=1), duration_minutes=60,
            location="Pool", max_participants=15,
        )
        self.assertTrue(future.requires_booking)

    def test_waitlist_promotes_first_client_and_hides_other_positions(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True, "booking_cutoff_hours": 8,
        })
        booking = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        waitlist = f"/api/client/schedule/sessions/{self.session.id}/waitlist/"
        for student in self.students[:15]:
            client = Client(); client.force_login(student.parent.user)
            self.assertEqual(self.post(client, booking, {"student_id": student.id}).status_code, 200)
        for student in self.students[15:17]:
            client = Client(); client.force_login(student.parent.user)
            self.assertEqual(self.post(client, waitlist, {"student_id": student.id}).status_code, 200)
        first_waiting = Client(); first_waiting.force_login(self.students[15].parent.user)
        other = Client(); other.force_login(self.students[16].parent.user)
        own = first_waiting.get(f"/api/client/schedule/?student_id={self.students[15].id}").json()["sessions"][0]
        self.assertEqual((own["booking_status"], own["waitlist_position"]), ("waitlisted", 1))
        self.assertEqual(self.post(first_waiting, waitlist, {"student_id": self.students[16].id}).status_code, 404)
        booked = Client(); booked.force_login(self.students[0].parent.user)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(booked.delete(booking, json.dumps({"student_id": self.students[0].id}),
                content_type="application/json").status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual(session_roster_students(self.session).count(), 15)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[15]).status,
            WaitlistStatus.PROMOTED)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[16]).status,
            WaitlistStatus.ACTIVE)
        competitor = Client(); competitor.force_login(self.students[17].parent.user)
        self.assertEqual(self.post(competitor, booking, {"student_id": self.students[17].id}).status_code, 400)
        self.assertEqual(other.get(f"/api/client/schedule/?student_id={self.students[16].id}").json()["sessions"][0]["waitlist_position"], 1)

    def test_cancel_restore_keeps_bookings_and_waitlist_order(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {"self_booking_enabled": True})
        booking = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        waitlist = f"/api/client/schedule/sessions/{self.session.id}/waitlist/"
        for student in self.students[:15]:
            client = Client(); client.force_login(student.parent.user)
            self.post(client, booking, {"student_id": student.id})
        waiting = Client(); waiting.force_login(self.students[15].parent.user)
        self.post(waiting, waitlist, {"student_id": self.students[15].id})
        self.assertEqual(self.post(self.admin_client,
            f"/api/admin/schedule/sessions/{self.session.id}/cancel/", {}).status_code, 200)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[15]).status,
            WaitlistStatus.SUSPENDED)
        booked = Client(); booked.force_login(self.students[0].parent.user)
        status = booked.get(f"/api/client/schedule/?student_id={self.students[0].id}").json()["sessions"][0]
        self.assertEqual(status["booking_status"], "cancelled")
        self.assertIsNone(booked.get('/api/client/overview/').json()['participants'][0]['next_session'])
        self.assertEqual(self.post(self.admin_client,
            f"/api/admin/schedule/sessions/{self.session.id}/restore/", {}).status_code, 200)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[15]).status,
            WaitlistStatus.ACTIVE)
        self.assertEqual(booked.get('/api/client/overview/').json()['participants'][0]['next_session']['id'],
            self.session.id)
        self.session.refresh_from_db()
        self.assertEqual(session_roster_students(self.session).count(), 15)

    def test_reminder_only_booked_for_masters(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {"self_booking_enabled": True})
        client = Client(); client.force_login(self.students[0].parent.user)
        other = Client(); other.force_login(self.students[1].parent.user)
        self.assertIsNone(other.get('/api/client/overview/').json()['participants'][0]['next_session'])
        self.post(client, f"/api/client/schedule/sessions/{self.session.id}/booking/", {
            "student_id": self.students[0].id,
        })
        self.assertEqual(client.get('/api/client/overview/').json()['participants'][0]['next_session']['id'],
            self.session.id)
        candidates = [row for row in _collect_session_reminder(timezone.now())
            if row.dedup_suffix.startswith(f"sess{self.session.id}s")]
        self.assertEqual([row.parent_id if hasattr(row, 'parent_id') else row.parent.id for row in candidates],
            [self.students[0].parent_id])

    def test_expired_date_with_balance_and_sent_message_visibility(self):
        student = self.students[0]
        subscription = Subscription.objects.create(
            student=student, subscription_type=f.make_sub_type(),
            start_date=timezone.localdate() - timedelta(days=60),
            base_end_date=timezone.localdate() - timedelta(days=30),
            status=SubscriptionStatus.EXPIRED,
        )
        SessionLedgerEntry.objects.create(subscription=subscription, delta=3,
            reason=LedgerReason.PURCHASE)
        client = Client(); client.force_login(student.parent.user)
        overview = client.get('/api/client/overview/').json()['participants'][0]
        self.assertEqual(overview['current_subscription']['id'], subscription.id)
        self.assertTrue(overview['current_subscription']['sessions_available_now'])
        self.assertEqual(overview['current_subscription']['ledger'][0]['delta'], 3)
        for status in (DeliveryStatus.QUEUED, DeliveryStatus.FAILED,
                       DeliveryStatus.SENT, DeliveryStatus.DELIVERED):
            NotificationLog.objects.create(recipient=student.parent,
                event_type=EventType.SCHEDULE_CHANGE, channel=Channel.EMAIL,
                status=status, body=status)
        messages = client.get('/api/client/notifications/?page=1&page_size=1').json()
        self.assertEqual(messages['pagination']['total'], 2)
        self.assertEqual(len(messages['notifications']), 1)
        self.assertIn(messages['notifications'][0]['status'], [DeliveryStatus.SENT, DeliveryStatus.DELIVERED])
        payment = Payment.objects.create(student=student, amount_minor=1000,
            paid_at=timezone.localdate())
        ReceiptFile.objects.create(payment=payment, is_deleted=True,
            deleted_at=timezone.now())
        history = client.get(f'/api/client/payment-history/?student_id={student.id}').json()
        self.assertTrue(history['payments'][0]['receipt_expired'])

    def test_capacity_increase_promotes_and_cutoff_stops_promotion(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True, "booking_cutoff_hours": 8,
        })
        booking = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        waiting_path = f"/api/client/schedule/sessions/{self.session.id}/waitlist/"
        for student in self.students[:15]:
            client = Client(); client.force_login(student.parent.user)
            self.post(client, booking, {"student_id": student.id})
        waiting = Client(); waiting.force_login(self.students[15].parent.user)
        self.post(waiting, waiting_path, {"student_id": self.students[15].id})
        edit_path = f"/api/admin/schedule/sessions/{self.session.id}/"
        self.assertEqual(self.post(self.admin_client, edit_path, {"max_participants": 16}).status_code, 200)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[15]).status,
            WaitlistStatus.PROMOTED)
        later = Client(); later.force_login(self.students[16].parent.user)
        self.assertEqual(self.post(later, waiting_path, {"student_id": self.students[16].id}).status_code, 200)
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {"booking_cutoff_hours": 72})
        booked = Client(); booked.force_login(self.students[0].parent.user)
        self.assertEqual(booked.delete(booking, json.dumps({"student_id": self.students[0].id}),
            content_type="application/json").status_code, 400)
        self.assertEqual(self.admin_client.delete(
            f"/api/admin/schedule/sessions/{self.session.id}/participants/{self.students[0].id}/").status_code, 200)
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[16]).status,
            WaitlistStatus.ACTIVE)
        self.assertEqual(later.delete(waiting_path, json.dumps({"student_id": self.students[16].id}),
            content_type="application/json").status_code, 200)

    def test_cancel_and_restore_record_distinct_delivery_problems(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {"self_booking_enabled": True})
        student = self.students[0]
        client = Client(); client.force_login(student.parent.user)
        self.post(client, f"/api/client/schedule/sessions/{self.session.id}/booking/", {
            "student_id": student.id,
        })
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.admin_client,
                f"/api/admin/schedule/sessions/{self.session.id}/cancel/", {}).status_code, 200)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post(self.admin_client,
                f"/api/admin/schedule/sessions/{self.session.id}/restore/", {}).status_code, 200)
        logs = NotificationLog.objects.filter(recipient=student.parent,
            event_type=EventType.SCHEDULE_CHANGE)
        self.assertEqual(logs.count(), 2)
        self.assertEqual(logs.filter(status=DeliveryStatus.FAILED).count(), 2)
        self.assertEqual(len(set(logs.values_list('dedup_key', flat=True))), 2)
        admin_session = self.admin_client.get(f"/api/admin/schedule/sessions/{self.session.id}/").json()
        self.assertTrue(admin_session['notification_delivery_issue'])
        listed = self.admin_client.get('/api/admin/schedule/sessions/').json()['sessions']
        self.assertTrue(next(row for row in listed if row['id'] == self.session.id)['notification_delivery_issue'])

    def test_restore_after_cutoff_expires_waitlist_without_new_booking(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "self_booking_enabled": True, "booking_cutoff_hours": 8,
        })
        booking = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        for student in self.students[:15]:
            client = Client(); client.force_login(student.parent.user)
            self.post(client, booking, {"student_id": student.id})
        waiting = Client(); waiting.force_login(self.students[15].parent.user)
        self.post(waiting, f"/api/client/schedule/sessions/{self.session.id}/waitlist/", {
            "student_id": self.students[15].id,
        })
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {
            "booking_cutoff_hours": 72,
        })
        self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/cancel/", {})
        self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/restore/", {})
        self.assertEqual(WaitlistEntry.objects.get(session=self.session, student=self.students[15]).status,
            WaitlistStatus.EXPIRED)
        self.assertFalse(SessionParticipant.objects.filter(session=self.session,
            student=self.students[15], status=SessionParticipantStatus.ACTIVE).exists())

    def test_admin_sees_missing_ukrainian_template_warning(self):
        template = NotificationTemplate.objects.create(event_type=EventType.SESSION_REMINDER,
            channel=Channel.EMAIL, subject='Занятие', body='{student}, {date}.')
        NotificationRule.objects.create(event_type=EventType.SESSION_REMINDER,
            channel=Channel.EMAIL, template=template, is_active=True)
        url = '/api/admin/notifications/templates/'
        row = self.admin_client.get(url).json()['templates'][0]
        self.assertTrue(row['missing_uk_translation'])
        NotificationTemplateTranslation.objects.create(template=template,
            language_code='uk', subject='Заняття', body='{student}, {date}.')
        self.assertFalse(self.admin_client.get(url).json()['templates'][0]['missing_uk_translation'])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_cancel_restore_and_edit_notify_booked_and_waiting_each_time(self):
        self.post(self.admin_client, f"/api/admin/groups/{self.group.id}/", {"self_booking_enabled": True})
        template = NotificationTemplate.objects.create(event_type=EventType.SCHEDULE_CHANGE,
            channel=Channel.EMAIL, subject="Занятие", body="{student}: {date}, {location}")
        NotificationRule.objects.create(event_type=EventType.SCHEDULE_CHANGE,
            channel=Channel.EMAIL, template=template, is_active=True)
        for student in (self.students[0], self.students[15]):
            student.parent.email = f"student{student.id}@example.com"
            student.parent.save(update_fields=["email"])
            Consent.objects.create(parent=student.parent, type=ConsentType.EMAIL).grant()
        booking = f"/api/client/schedule/sessions/{self.session.id}/booking/"
        for student in self.students[:15]:
            client = Client(); client.force_login(student.parent.user)
            self.post(client, booking, {"student_id": student.id})
        waiting = Client(); waiting.force_login(self.students[15].parent.user)
        self.post(waiting, f"/api/client/schedule/sessions/{self.session.id}/waitlist/", {
            "student_id": self.students[15].id,
        })
        with self.captureOnCommitCallbacks(execute=True):
            self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/cancel/", {})
        with self.captureOnCommitCallbacks(execute=True):
            self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/restore/", {})
        with self.captureOnCommitCallbacks(execute=True):
            self.post(self.admin_client, f"/api/admin/schedule/sessions/{self.session.id}/", {
                "location": "Pool B",
            })
        sent = NotificationLog.objects.filter(
            recipient__in=[self.students[0].parent, self.students[15].parent],
            event_type=EventType.SCHEDULE_CHANGE, status=DeliveryStatus.SENT)
        self.assertEqual(sent.count(), 6)
        self.assertEqual(len(set(sent.values_list("dedup_key", flat=True))), 6)
        self.assertEqual(len(mail.outbox), 6)


@skipUnless(connection.features.has_select_for_update, "Requires row-locking database")
@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ConcurrentPromotionTest(TransactionTestCase):
    def test_two_clients_cannot_book_the_last_place_concurrently(self):
        group = Group.objects.create(name="Masters last seat", self_booking_enabled=True)
        trainer = f.make_trainer("last_seat_trainer")
        first, second = [f.make_student(group=group) for _ in range(2)]
        session = create_session(group=group, trainer=trainer,
            start_at=timezone.now() + timedelta(days=2), duration_minutes=60,
            location="Pool", max_participants=1)
        barrier = Barrier(2)
        successes = []
        errors = []

        def book(student):
            close_old_connections()
            barrier.wait()
            try:
                change_client_booking(session_id=session.id, student=student,
                    book=True, actor=student.parent.user)
                successes.append(student.id)
            except Exception as exc:
                errors.append(exc)
            finally:
                close_old_connections()

        threads = [Thread(target=book, args=(student,)) for student in (first, second)]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=10)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], ValidationError)
        self.assertEqual(SessionParticipant.objects.filter(
            session=session, status=SessionParticipantStatus.ACTIVE).count(), 1)

    def test_waitlist_keeps_last_seat_when_client_books_concurrently(self):
        group = Group.objects.create(name="Masters race", self_booking_enabled=True)
        trainer = f.make_trainer("race_trainer")
        booked, waiting, competing = [f.make_student(group=group) for _ in range(3)]
        session = create_session(group=group, trainer=trainer,
            start_at=timezone.now() + timedelta(days=2), duration_minutes=60,
            location="Pool", max_participants=1)
        change_client_booking(session_id=session.id, student=booked, book=True, actor=booked.parent.user)
        change_client_waitlist(session_id=session.id, student=waiting, join=True, actor=waiting.parent.user)
        barrier = Barrier(2)
        errors = []
        competing_errors = []

        def cancel():
            close_old_connections()
            barrier.wait()
            try:
                change_client_booking(session_id=session.id, student=booked,
                    book=False, actor=booked.parent.user)
            except Exception as exc:
                errors.append(exc)
            finally:
                close_old_connections()

        def compete():
            close_old_connections()
            barrier.wait()
            try:
                change_client_booking(session_id=session.id, student=competing,
                    book=True, actor=competing.parent.user)
            except Exception as exc:
                competing_errors.append(exc)
            finally:
                close_old_connections()

        threads = [Thread(target=cancel), Thread(target=compete)]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=10)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertEqual(len(competing_errors), 1)
        self.assertIsInstance(competing_errors[0], ValidationError)
        self.assertEqual(list(SessionParticipant.objects.filter(session=session,
            status=SessionParticipantStatus.ACTIVE).values_list("student_id", flat=True)), [waiting.id])
