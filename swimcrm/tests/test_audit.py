"""GAP-1 / section 5.12: domain actions are recorded in the immutable audit log."""
from datetime import date, timedelta

from django.contrib.admin.sites import AdminSite
from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from audit.models import AuditLogEntry
from billing.models import Payment, PaymentStatus
from billing.services import confirm_payment, reject_payment
from dataio import importer
from scheduling.services import create_session, generate_sessions
from students.admin import StudentAdmin
from students.models import Student
from subscriptions.services import create_subscription, freeze_subscription

from . import factories as f


class _Req:
    """Minimal stand-in for an admin request (only .user is used)."""
    def __init__(self, user):
        self.user = user


class _Form:
    changed_data = []


class AuditLogRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin()
        self.parent = f.make_parent()
        self.group = f.make_group()
        self.trainer = f.make_trainer()
        self.student = f.make_student(parent=self.parent, group=self.group)

    def test_confirm_payment_is_audited(self):
        p = Payment.objects.create(student=self.student, amount_minor=1000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)
        confirm_payment(p, self.admin)
        e = AuditLogEntry.objects.get(action="payment.confirmed")
        self.assertEqual(e.actor, self.admin)
        self.assertEqual(e.entity_type, "Payment")
        self.assertEqual(e.entity_id, str(p.pk))

    def test_reject_payment_is_audited(self):
        p = Payment.objects.create(student=self.student, amount_minor=1000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)
        reject_payment(p, self.admin, reason="дубль")
        self.assertTrue(AuditLogEntry.objects.filter(
            action="payment.rejected", actor=self.admin).exists())

    def test_subscription_create_and_freeze_are_audited(self):
        stype = f.make_sub_type()
        sub = create_subscription(student=self.student, subscription_type=stype,
                                  start_date=date.today(), created_by=self.admin)
        freeze_subscription(subscription=sub, start_date=date.today(),
                            end_date=date.today() + timedelta(days=5), created_by=self.admin)
        actions = set(AuditLogEntry.objects.values_list("action", flat=True))
        self.assertIn("subscription.created", actions)
        self.assertIn("subscription.frozen", actions)

    def test_schedule_generation_is_audited_with_actor(self):
        tpl = f.make_template(self.group, self.trainer)
        start = date.today()
        generate_sessions(tpl, start, start + timedelta(days=14),
                          skip_conflicts=True, actor=self.admin)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="schedule.generated", actor=self.admin).exists())

    def test_no_audit_without_actor(self):
        tpl = f.make_template(self.group, self.trainer)
        start = date.today()
        generate_sessions(tpl, start, start + timedelta(days=14), skip_conflicts=True)
        self.assertFalse(AuditLogEntry.objects.filter(action="schedule.generated").exists())

    def test_attendance_marking_is_audited(self):
        now = timezone.now()
        sess = create_session(trainer=self.trainer, start_at=now,
                              end_at=now + timedelta(hours=1), location="Бассейн A",
                              max_participants=10, group=self.group)
        set_attendance(session_id=sess.id, student=self.student,
                       status=AttendanceStatus.PRESENT, actor=self.admin)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="attendance.marked", actor=self.admin).exists())

    def test_import_creates_audited_clients(self):
        f.make_sub_type(name="Абонемент 8", sessions=8)
        csv = ("Фамилия;Имя;Телефон;Email\r\n"
               "Тест;Юзер;+48111222;test@example.com\r\n")
        headers, rows = importer.parse_source(csv.encode("utf-8"), "c.csv")
        mapping = {"Фамилия": "last_name", "Имя": "first_name",
                   "Телефон": "phone", "Email": "email"}
        pv = importer.preview(headers, rows, mapping)
        importer.commit(pv, actor=self.admin)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="client.created", actor=self.admin).exists())

    def test_admin_create_of_client_is_audited(self):
        ma = StudentAdmin(Student, AdminSite())
        obj = Student(parent=self.parent, first_name="Ада", last_name="Тестова")
        ma.save_model(_Req(self.admin), obj, _Form(), change=False)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="client.created", actor=self.admin, entity_id=str(obj.pk)).exists())

    def test_audit_helper_emits_server_log(self):
        p = Payment.objects.create(student=self.student, amount_minor=1000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)

        with self.assertLogs("audit", level="INFO") as logs:
            confirm_payment(p, self.admin)

        self.assertTrue(any("audit_event action=payment.confirmed" in line for line in logs.output))
