from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from scheduling.models import SessionType, SessionTypeConfig
from scheduling.services import create_session, edit_single_session

from . import factories as f


class SessionTariffAndDurationTest(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer("tariff_duration_trainer")
        self.student = f.make_student(first="Solo", last="Client")
        SessionTypeConfig.objects.update_or_create(
            code=SessionType.INDIVIDUAL,
            defaults={
                "label": "Individual",
                "default_capacity": 1,
                "default_price_minor": 9000,
                "default_currency": "PLN",
                "default_duration_minutes": 45,
            },
        )
        SessionTypeConfig.objects.update_or_create(
            code=SessionType.SPLIT,
            defaults={
                "label": "Split",
                "default_capacity": 2,
                "default_price_minor": 10001,
                "default_currency": "PLN",
                "default_duration_minutes": 60,
            },
        )

    def test_uses_type_defaults_and_calculates_end(self):
        start = timezone.now() + timedelta(days=2)
        session = create_session(
            trainer=self.trainer,
            start_at=start,
            location="Pool",
            max_participants=1,
            session_type=SessionType.INDIVIDUAL,
            individual_student=self.student,
        )
        self.assertEqual(session.duration_minutes, 45)
        self.assertEqual(session.end_at, start + timedelta(minutes=45))
        self.assertEqual(session.price_minor, 9000)
        self.assertEqual(session.currency, "PLN")

    def test_explicit_zero_and_custom_price_override_type_default(self):
        start = timezone.now() + timedelta(days=2)
        free_session = create_session(
            trainer=self.trainer,
            start_at=start,
            location="Pool",
            max_participants=1,
            session_type=SessionType.INDIVIDUAL,
            individual_student=self.student,
            price_minor=0,
        )
        custom_session = create_session(
            trainer=self.trainer,
            start_at=start + timedelta(hours=2),
            location="Pool",
            max_participants=1,
            session_type=SessionType.INDIVIDUAL,
            individual_student=self.student,
            price_minor=12500,
        )
        self.assertEqual(free_session.price_minor, 0)
        self.assertEqual(custom_session.price_minor, 12500)

    def test_rejects_conflicting_end_and_duration(self):
        start = timezone.now() + timedelta(days=3)
        with self.assertRaisesMessage(ValidationError, "conflicts"):
            create_session(
                trainer=self.trainer,
                start_at=start,
                end_at=start + timedelta(minutes=60),
                duration_minutes=45,
                location="Pool",
                max_participants=1,
                session_type=SessionType.INDIVIDUAL,
                individual_student=self.student,
            )

    def test_split_price_is_shared_and_rounded_down(self):
        second = f.make_student(first="Split", last="Second")
        start = timezone.now() + timedelta(days=4)
        session = create_session(
            trainer=self.trainer,
            start_at=start,
            duration_minutes=60,
            location="Pool",
            max_participants=2,
            session_type=SessionType.SPLIT,
            individual_student=self.student,
        )
        set_attendance(
            session_id=session.id, student=self.student, status=AttendanceStatus.PRESENT)
        set_attendance(
            session_id=session.id, student=second, status=AttendanceStatus.PRESENT)
        self.assertEqual(self.student.charges.get().amount_minor, 5000)
        self.assertEqual(second.charges.get().amount_minor, 5000)

    def test_price_can_change_until_financial_effect_exists(self):
        start = timezone.now() + timedelta(days=5)
        future = create_session(
            trainer=self.trainer,
            start_at=start,
            duration_minutes=45,
            location="Pool",
            max_participants=1,
            session_type=SessionType.INDIVIDUAL,
            individual_student=self.student,
        )
        edit_single_session(future, price_minor=9500)
        self.assertEqual(future.price_minor, 9500)

        past_student = f.make_student(first="Past", last="Client")
        past_start = timezone.now() - timedelta(hours=2)
        past = create_session(
            trainer=self.trainer,
            start_at=past_start,
            duration_minutes=45,
            location="Pool",
            max_participants=1,
            session_type=SessionType.INDIVIDUAL,
            individual_student=past_student,
        )
        edit_single_session(past, price_minor=9500)
        self.assertEqual(past.price_minor, 9500)

        set_attendance(
            session_id=past.id,
            student=past_student,
            status=AttendanceStatus.PRESENT,
        )
        with self.assertRaisesMessage(ValidationError, "locked"):
            edit_single_session(past, price_minor=10000)
