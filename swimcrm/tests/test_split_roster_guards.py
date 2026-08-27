from django.contrib.admin.sites import AdminSite
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase

from attendance.models import AttendanceRecord, AttendanceStatus
from scheduling.models import (
    Session,
    SessionParticipant,
    SessionParticipantStatus,
    SessionType,
)
from scheduling.admin import SessionAdmin, SessionParticipantAdmin
from scheduling.services import create_session

from . import factories as f


class SplitRosterModelGuard(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer("split_model_guard")
        self.first = f.make_student(first="First", last="Guard")
        self.second = f.make_student(first="Second", last="Guard")
        self.session = create_session(
            trainer=self.trainer,
            individual_student=self.first,
            session_type=SessionType.SPLIT,
            start_at=f.dt(2026, 9, 10, 17),
            duration_minutes=60,
            location="Split model guard",
            max_participants=2,
        )
        self.participant = SessionParticipant.objects.create(
            session=self.session,
            student=self.second,
        )

    def test_model_validation_rejects_split_roster_above_capacity(self):
        third = f.make_student(first="Third", last="Guard")
        duplicate_base = SessionParticipant(
            session=self.session,
            student=self.first,
        )
        above_capacity = SessionParticipant(
            session=self.session,
            student=third,
        )

        with self.assertRaises(ValidationError):
            duplicate_base.full_clean()
        with self.assertRaises(ValidationError):
            above_capacity.full_clean()

        self.session.max_participants = 1
        with self.assertRaises(ValidationError):
            self.session.full_clean()

    def test_model_validation_rejects_invalid_primary_split_client_changes(self):
        self.session.individual_student = self.second
        with self.assertRaises(ValidationError):
            self.session.full_clean()
        self.session.refresh_from_db()

        archived = f.make_student(first="Archived", last="Primary Guard")
        archived.parent.user.is_active = False
        archived.parent.user.save(update_fields=["is_active"])
        self.session.individual_student = archived
        with self.assertRaises(ValidationError):
            self.session.full_clean()

    def test_model_validation_rejects_leaving_split_with_active_roster(self):
        self.session.session_type = SessionType.INDIVIDUAL

        with self.assertRaises(ValidationError) as raised:
            self.session.full_clean()

        self.assertEqual(
            raised.exception.error_dict["session_type"][0].code,
            "roster_not_empty",
        )

    def test_model_validation_freezes_attended_split_roster(self):
        AttendanceRecord.objects.create(
            session=self.session,
            student=self.first,
            status=AttendanceStatus.PRESENT,
        )
        replacement = f.make_student(first="Replacement", last="Guard")

        self.session.individual_student = replacement
        with self.assertRaises(ValidationError):
            self.session.full_clean()
        self.session.refresh_from_db()

        self.participant.status = SessionParticipantStatus.CANCELLED
        with self.assertRaises(ValidationError):
            self.participant.full_clean()
        self.participant.refresh_from_db()

        with self.assertRaises(ValidationError):
            SessionParticipant(
                session=self.session,
                student=replacement,
            ).full_clean()
        with self.assertRaises(ValidationError):
            self.participant.delete()

    def test_django_admin_cannot_delete_attended_split_participants(self):
        AttendanceRecord.objects.create(
            session=self.session,
            student=self.first,
            status=AttendanceStatus.PRESENT,
        )
        request = RequestFactory().get("/admin/scheduling/sessionparticipant/")
        request.user = f.make_admin("split_admin_guard")
        model_admin = SessionParticipantAdmin(SessionParticipant, AdminSite())

        self.assertFalse(model_admin.has_delete_permission(request, self.participant))
        self.assertNotIn("delete_selected", model_admin.get_actions(request))

    def test_django_admin_rechecks_split_capacity_and_freeze_on_save(self):
        request = RequestFactory().post("/admin/scheduling/session/change/")
        request.user = f.make_admin("split_admin_save_guard")
        session_admin = SessionAdmin(Session, AdminSite())
        participant_admin = SessionParticipantAdmin(
            SessionParticipant, AdminSite())

        self.session.max_participants = 1
        with self.assertRaises(ValidationError):
            session_admin.save_model(request, self.session, form=None, change=True)
        self.session.refresh_from_db()

        AttendanceRecord.objects.create(
            session=self.session,
            student=self.first,
            status=AttendanceStatus.PRESENT,
        )
        replacement = f.make_student(first="Admin", last="Save Guard")
        added = SessionParticipant(
            session=self.session,
            student=replacement,
        )
        with self.assertRaises(ValidationError):
            participant_admin.save_model(
                request, added, form=None, change=False)
        self.assertFalse(SessionParticipant.objects.filter(
            session=self.session,
            student=replacement,
        ).exists())
