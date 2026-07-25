"""Import/export module 5.10 extension: attendance history import."""
from django.test import TestCase

from attendance.models import AttendanceRecord, AttendanceStatus
from catalog.models import Group
from dataio import attendance_importer as ai
from dataio.importer import parse_source
from scheduling.models import Session, SessionParticipant, SessionType
from scheduling.services import create_session
from subscriptions.models import LedgerReason, SessionLedgerEntry

from . import factories as f


def _csv(rows):
    header = "Дата;Клиент;Группа;Тренер;Статус;Окончание;Локация;Вместимость\r\n"
    return (header + "\r\n".join(rows) + "\r\n").encode("utf-8")


class AttendanceImportPreviewTest(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer(username="coach_ai")
        self.group = f.make_group(name="Дельфины")
        self.student = f.make_student(group=self.group, first="Ян", last="Ковальский",
                                      email="jan.ai@example.com")

    def test_matches_existing_session(self):
        start = f.dt(2026, 3, 2, 10)
        create_session(trainer=self.trainer, start_at=start, end_at=f.dt(2026, 3, 2, 11),
                       location="Бассейн A", max_participants=10, group=self.group)
        row = "02.03.2026 10:00;jan.ai@example.com;Дельфины;coach_ai;present;;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.MATCHED)
        self.assertEqual(pv[0].resolved["student_id"], self.student.id)

    def test_accepts_russian_status_label(self):
        start = f.dt(2026, 3, 2, 10)
        create_session(trainer=self.trainer, start_at=start, end_at=f.dt(2026, 3, 2, 11),
                       location="Бассейн A", max_participants=10, group=self.group)
        row = "02.03.2026 10:00;jan.ai@example.com;Дельфины;coach_ai;Присутствовал;;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.MATCHED)
        self.assertEqual(pv[0].resolved["status"], AttendanceStatus.PRESENT)

    def test_flags_duplicate_when_attendance_already_recorded(self):
        start = f.dt(2026, 3, 2, 10)
        session = create_session(trainer=self.trainer, start_at=start, end_at=f.dt(2026, 3, 2, 11),
                                 location="Бассейн A", max_participants=10, group=self.group)
        AttendanceRecord.objects.create(session=session, student=self.student,
                                        status=AttendanceStatus.PRESENT)
        row = "02.03.2026 10:00;jan.ai@example.com;Дельфины;coach_ai;present;;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.DUPLICATE)

    def test_plans_session_creation_when_no_match(self):
        row = "05.03.2026 09:00;jan.ai@example.com;Дельфины;coach_ai;present;10:00;Бассейн B;12"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.WILL_CREATE_SESSION)
        self.assertEqual(pv[0].resolved["location"], "Бассейн B")
        self.assertEqual(pv[0].resolved["max_participants"], 12)

    def test_session_creation_requires_location_and_capacity(self):
        row = "05.03.2026 09:00;jan.ai@example.com;Дельфины;coach_ai;present;10:00;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.ERROR)
        self.assertTrue(any("вместимость" in e.lower() for e in pv[0].errors))
        self.assertTrue(any("локация" in e.lower() for e in pv[0].errors))

    def test_unknown_client_is_an_error(self):
        row = "05.03.2026 09:00;ghost@example.com;Дельфины;coach_ai;present;10:00;Бассейн B;12"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.ERROR)
        self.assertTrue(any("не найден" in e for e in pv[0].errors))

    def test_unknown_group_and_missing_trainer_is_an_error(self):
        row = "05.03.2026 09:00;jan.ai@example.com;Акулы;;present;10:00;Бассейн B;12"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.ERROR)
        self.assertTrue(any("группа не найдена" in e.lower() for e in pv[0].errors))


class AttendanceImportCommitTest(TestCase):
    def setUp(self):
        self.trainer = f.make_trainer(username="coach_commit")
        self.group = f.make_group(name="Акулы")
        self.student = f.make_student(group=self.group, first="Ева", last="Новак",
                                      email="ewa.ai@example.com")
        self.sub_type = f.make_sub_type(name="Абонемент 8", sessions=8)
        from subscriptions.services import create_subscription
        from datetime import date
        create_subscription(student=self.student, subscription_type=self.sub_type,
                            start_date=date(2026, 1, 1))

    def test_commit_creates_session_marks_attendance_and_deducts_ledger(self):
        row = "10.03.2026 09:00;ewa.ai@example.com;Акулы;coach_commit;present;10:00;Бассейн C;15"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.WILL_CREATE_SESSION)

        summary = ai.commit(pv, actor=None)
        self.assertEqual(summary["created_sessions"], 1)
        self.assertEqual(summary["created_records"], 1)
        self.assertEqual(summary["skipped"], 0)
        self.assertEqual(summary["errors"], [])

        session = Session.objects.get(group=self.group, location="Бассейн C")
        record = AttendanceRecord.objects.get(session=session, student=self.student)
        self.assertEqual(record.status, AttendanceStatus.PRESENT)
        ledger = SessionLedgerEntry.objects.get(attendance=record)
        self.assertEqual(ledger.delta, -1)
        self.assertEqual(ledger.reason, LedgerReason.ATTENDANCE)

    def test_commit_matched_row_marks_attendance_without_creating_session(self):
        start = f.dt(2026, 3, 11, 9)
        session = create_session(trainer=self.trainer, start_at=start, end_at=f.dt(2026, 3, 11, 10),
                                 location="Бассейн D", max_participants=10, group=self.group)
        row = "11.03.2026 09:00;ewa.ai@example.com;Акулы;coach_commit;present;;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.MATCHED)

        summary = ai.commit(pv, actor=None)
        self.assertEqual(summary["created_sessions"], 0)
        self.assertEqual(summary["created_records"], 1)
        self.assertTrue(AttendanceRecord.objects.filter(session=session, student=self.student).exists())

    def test_commit_skips_rows_that_are_not_matched_or_creatable(self):
        row = "12.03.2026 09:00;ghost@example.com;Акулы;coach_commit;present;;;"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.ERROR)

        summary = ai.commit(pv, actor=None)
        self.assertEqual(summary["created_sessions"], 0)
        self.assertEqual(summary["created_records"], 0)
        self.assertEqual(summary["skipped"], 1)

    def test_commit_adds_non_roster_student_as_session_participant(self):
        other_group = f.make_group(name="Черепахи")
        outside_student = f.make_student(group=other_group, first="Марк", last="Зима",
                                         email="mark.ai@example.com")
        row = "13.03.2026 09:00;mark.ai@example.com;Акулы;coach_commit;present;10:00;Бассейн E;15"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.WILL_CREATE_SESSION)

        summary = ai.commit(pv, actor=None)
        self.assertEqual(summary["created_records"], 1)
        session = Session.objects.get(group=self.group, location="Бассейн E")
        self.assertTrue(SessionParticipant.objects.filter(
            session=session, student=outside_student).exists())

    def test_commit_reports_trainer_conflict_as_row_error(self):
        # An existing session already occupies coach_commit at this exact time.
        create_session(trainer=self.trainer, start_at=f.dt(2026, 3, 14, 9),
                       end_at=f.dt(2026, 3, 14, 10), location="Бассейн F",
                       max_participants=10, individual_student=self.student,
                       session_type=SessionType.INDIVIDUAL)
        other_group = f.make_group(name="Киты")
        row = "14.03.2026 09:00;ewa.ai@example.com;Киты;coach_commit;present;10:00;Бассейн G;15"
        headers, rows = parse_source(_csv([row]), "att.csv")
        pv = ai.preview(headers, rows)
        self.assertEqual(pv[0].status, ai.WILL_CREATE_SESSION)

        summary = ai.commit(pv, actor=None)
        self.assertEqual(summary["created_sessions"], 0)
        self.assertEqual(summary["skipped"], 1)
        self.assertEqual(len(summary["errors"]), 1)
        self.assertFalse(Session.objects.filter(group=other_group).exists())
