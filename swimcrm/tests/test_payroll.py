import json
from datetime import date

from django.core.exceptions import ValidationError
from django.test import TestCase

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from payroll.models import (PayrollCalculation, PayrollRule, PayrollScheme,
                            TrainerPayrollAssignment)
from payroll.services import calculate_payroll_period
from scheduling.models import SessionParticipant, SessionType
from scheduling.services import create_session

from . import factories as f


class PayrollCalculationRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.trainer = f.make_trainer()
        self.substitute = f.make_trainer(username="payroll_substitute")
        self.group = f.make_group("Payroll group")
        self.scheme = PayrollScheme.objects.create(name="Default payroll")
        TrainerPayrollAssignment.objects.create(
            trainer=self.trainer,
            scheme=self.scheme,
            effective_from=date(2026, 7, 1),
        )
        PayrollRule.objects.create(
            scheme=self.scheme,
            session_type=SessionType.GROUP,
            rule_type=SessionType.GROUP,
            base_amount_minor=10000,
            min_clients_threshold=2,
            extra_client_amount_minor=1500,
        )
        PayrollRule.objects.create(
            scheme=self.scheme,
            session_type=SessionType.INDIVIDUAL,
            rule_type=SessionType.INDIVIDUAL,
            base_amount_minor=8000,
        )
        PayrollRule.objects.create(
            scheme=self.scheme,
            session_type=SessionType.SPLIT,
            rule_type=SessionType.SPLIT,
            base_amount_minor=9000,
        )
        TrainerPayrollAssignment.objects.create(
            trainer=self.substitute,
            scheme=self.scheme,
            effective_from=date(2026, 7, 1),
        )

    def _student(self, suffix, group=None):
        return f.make_student(group=group, first=f"Student{suffix}", email=f"s{suffix}@example.test")

    def test_calculates_group_extra_clients_and_fixed_individual_split(self):
        group_session = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 10, 17),
            end_at=f.dt(2026, 7, 10, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        for idx in range(4):
            set_attendance(
                session_id=group_session.id,
                student=self._student(idx, group=self.group),
                status=AttendanceStatus.PRESENT,
                actor=self.admin,
            )

        individual_student = self._student("individual")
        create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 11, 9),
            end_at=f.dt(2026, 7, 11, 10),
            location="Pool A",
            max_participants=1,
            individual_student=individual_student,
            session_type=SessionType.INDIVIDUAL,
            actor=self.admin,
        )
        split_student = self._student("split")
        create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 12, 9),
            end_at=f.dt(2026, 7, 12, 10),
            location="Pool A",
            max_participants=2,
            individual_student=split_student,
            session_type=SessionType.SPLIT,
            actor=self.admin,
        )

        summary = calculate_payroll_period(
            date_from=date(2026, 7, 1),
            date_to=date(2026, 7, 31),
            actor=self.admin,
        )
        amounts = list(PayrollCalculation.objects.order_by("session__start_at")
                       .values_list("final_amount_minor", flat=True))

        self.assertEqual(summary.calculations_count, 3)
        self.assertEqual(amounts, [13000, 8000, 9000])
        self.assertEqual(summary.total_amount_minor, 30000)

    def test_substitute_trainer_receives_payroll_for_delivered_session(self):
        session = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 13, 17),
            end_at=f.dt(2026, 7, 13, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        session.substitute_trainer = self.substitute
        session.full_clean()
        session.save(update_fields=["substitute_trainer"])
        for idx in range(2):
            set_attendance(
                session_id=session.id,
                student=self._student(f"sub{idx}", group=self.group),
                status=AttendanceStatus.PRESENT,
                actor=self.admin,
            )

        summary = calculate_payroll_period(
            date_from=date(2026, 7, 1),
            date_to=date(2026, 7, 31),
            actor=self.admin,
        )
        calculation = PayrollCalculation.objects.get()

        self.assertEqual(summary.calculations_count, 1)
        self.assertEqual(calculation.trainer, self.substitute)
        self.assertEqual(calculation.session.trainer, self.trainer)
        self.assertEqual(calculation.final_amount_minor, 10000)

    def test_substitute_trainer_cannot_match_scheduled_trainer(self):
        session = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 14, 17),
            end_at=f.dt(2026, 7, 14, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        session.substitute_trainer = self.trainer

        with self.assertRaises(ValidationError):
            session.full_clean()

    def test_split_payroll_is_fixed_for_one_or_two_attendees(self):
        one_student = self._student("split-one")
        one_attendee = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 15, 9),
            end_at=f.dt(2026, 7, 15, 10),
            location="Pool A",
            max_participants=2,
            individual_student=one_student,
            session_type=SessionType.SPLIT,
            actor=self.admin,
        )
        set_attendance(
            session_id=one_attendee.id,
            student=one_student,
            status=AttendanceStatus.PRESENT,
            actor=self.admin,
        )

        first_student = self._student("split-two-a")
        second_student = self._student("split-two-b")
        two_attendees = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 16, 9),
            end_at=f.dt(2026, 7, 16, 10),
            location="Pool A",
            max_participants=2,
            individual_student=first_student,
            session_type=SessionType.SPLIT,
            actor=self.admin,
        )
        SessionParticipant.objects.create(session=two_attendees, student=second_student)
        for student in (first_student, second_student):
            set_attendance(
                session_id=two_attendees.id,
                student=student,
                status=AttendanceStatus.PRESENT,
                actor=self.admin,
            )

        summary = calculate_payroll_period(
            date_from=date(2026, 7, 1),
            date_to=date(2026, 7, 31),
            actor=self.admin,
        )
        amounts = list(PayrollCalculation.objects.order_by("session__start_at")
                       .values_list("attended_clients_count", "final_amount_minor"))

        self.assertEqual(summary.calculations_count, 2)
        self.assertEqual(amounts, [(1, 9000), (2, 9000)])
        self.assertEqual(summary.total_amount_minor, 18000)

    def test_cancelled_sessions_are_excluded_from_payroll(self):
        cancelled = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 17, 17),
            end_at=f.dt(2026, 7, 17, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        cancelled.is_cancelled = True
        cancelled.save(update_fields=["is_cancelled"])

        summary = calculate_payroll_period(
            date_from=date(2026, 7, 1),
            date_to=date(2026, 7, 31),
            actor=self.admin,
        )

        self.assertEqual(summary.calculations_count, 0)
        self.assertFalse(PayrollCalculation.objects.exists())


class AdminPayrollApiRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.client.force_login(self.admin)
        self.trainer = f.make_trainer()
        self.group = f.make_group("API payroll group")

    def test_admin_can_configure_and_calculate_payroll_period(self):
        scheme = self.client.post(
            "/api/admin/payroll/schemes/",
            data=json.dumps({"name": "API payroll"}),
            content_type="application/json",
        )
        self.assertEqual(scheme.status_code, 201)
        scheme_id = scheme.json()["id"]

        rule = self.client.post(
            "/api/admin/payroll/rules/",
            data=json.dumps({
                "scheme_id": scheme_id,
                "session_type": SessionType.GROUP,
                "rule_type": SessionType.GROUP,
                "base_amount_minor": 10000,
                "min_clients_threshold": 1,
                "extra_client_amount_minor": 2000,
            }),
            content_type="application/json",
        )
        assignment = self.client.post(
            "/api/admin/payroll/assignments/",
            data=json.dumps({
                "trainer_id": self.trainer.id,
                "scheme_id": scheme_id,
                "effective_from": "2026-07-01",
            }),
            content_type="application/json",
        )
        self.assertEqual(rule.status_code, 201)
        self.assertEqual(assignment.status_code, 201)

        session = create_session(
            trainer=self.trainer,
            start_at=f.dt(2026, 7, 15, 17),
            end_at=f.dt(2026, 7, 15, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        for idx in range(3):
            set_attendance(
                session_id=session.id,
                student=f.make_student(group=self.group, first=f"Api{idx}", email=f"api{idx}@example.test"),
                status=AttendanceStatus.PRESENT,
                actor=self.admin,
            )

        period = self.client.post(
            "/api/admin/payroll/periods/",
            data=json.dumps({"date_from": "2026-07-01", "date_to": "2026-07-31"}),
            content_type="application/json",
        )

        self.assertEqual(period.status_code, 201)
        self.assertEqual(period.json()["summary"]["calculations_count"], 1)
        self.assertEqual(period.json()["summary"]["total_amount_minor"], 14000)
        self.assertEqual(period.json()["calculations"][0]["extra_clients_count"], 2)
