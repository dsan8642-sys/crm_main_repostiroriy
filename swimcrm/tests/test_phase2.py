import io
import json
from datetime import date, datetime, time, timedelta

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from accounts.models import Consent, ConsentType
from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentStatus
from billing.services import confirm_payment
from catalog.models import Group
from scheduling.services import create_session
from students.models import Student
from subscriptions.services import create_subscription, freeze_subscription

from analytics.debtors import debtors, upcoming
from analytics import reports
from dataio import importer, exports
from dataio.importer import NEW, DUPLICATE, ERROR
from dataio.models import ImportBatch
from localization.models import DictionaryKey, DictionaryTranslation
from localization.services import translate
from notifications.backends import SmsBackend, TelegramBackend
from notifications.models import (Channel, DeliveryStatus, EventType,
                                  NotificationLog, NotificationRule,
                                  NotificationTemplate,
                                  NotificationTemplateTranslation,
                                  QuietHoursPolicy)
from notifications.services import channel_allowed, deliver_pending, run_scheduler

from . import factories as f


class LocalizationRule(TestCase):
    @override_settings(SWIMCRM_DEFAULT_LANGUAGE="en")
    def test_dictionary_translation_uses_requested_language_then_default(self):
        key = DictionaryKey.objects.create(domain="ui", code="dashboard.title")
        DictionaryTranslation.objects.create(
            key=key,
            language_code="en",
            value="Dashboard",
        )
        DictionaryTranslation.objects.create(
            key=key,
            language_code="pl",
            value="Panel",
        )

        self.assertEqual(translate("ui", "dashboard.title", "pl"), "Panel")
        self.assertEqual(translate("ui", "dashboard.title", "uk"), "Dashboard")
        self.assertEqual(translate("ui", "missing", "uk", default="Missing"), "Missing")


# ---------------- 5.5 Debtors / upcoming ----------------
class DebtorsRule(TestCase):
    def test_overdue_charge_makes_debtor(self):
        st = f.make_student()
        Charge.objects.create(student=st, description="Абонемент", amount_minor=24000,
                              currency="PLN", due_date=date.today() - timedelta(days=5))
        rows = debtors()
        self.assertEqual(len(rows), 1)
        self.assertIn("Просроченная оплата", rows[0].reasons)
        self.assertEqual(rows[0].balance_minor, 24000)

    def test_confirmed_payment_clears_debtor(self):
        st = f.make_student()
        Charge.objects.create(student=st, description="Абонемент", amount_minor=24000,
                              currency="PLN", due_date=date.today() - timedelta(days=5))
        p = Payment.objects.create(student=st, amount_minor=24000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)
        confirm_payment(p, f.make_admin())
        self.assertEqual(len(debtors()), 0)

    def test_subscription_in_grace_period_is_not_expired_debtor(self):
        st = f.make_student()
        create_subscription(
            student=st,
            subscription_type=f.make_sub_type(sessions=8, days=30),
            start_date=date.today() - timedelta(days=35),
        )
        self.assertEqual(debtors(), [])

    def test_subscription_after_grace_period_is_expired_debtor(self):
        st = f.make_student()
        create_subscription(
            student=st,
            subscription_type=f.make_sub_type(sessions=8, days=30),
            start_date=date.today() - timedelta(days=40),
        )
        rows = debtors()
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0].reasons)

    def test_upcoming_by_end_date_and_low_sessions(self):
        st = f.make_student()
        sub = create_subscription(student=st, subscription_type=f.make_sub_type(sessions=8, days=5),
                                  start_date=date.today())
        # ends in 5 days -> within 7-day window
        self.assertEqual(len(upcoming(within_days=7)), 1)
        self.assertEqual(len(upcoming(within_days=1)), 0)
        # low sessions filter
        from subscriptions.services import manual_adjust
        manual_adjust(subscription=sub, delta=-7)  # 1 left
        self.assertEqual(len(upcoming(within_days=1, min_sessions=2)), 1)


# ---------------- 5.9 Reports ----------------
class ReportsRule(TestCase):
    def setUp(self):
        self.g = Group.objects.create(name="Акулы")
        self.st = f.make_student(group=self.g)
        admin = f.make_admin()
        p = Payment.objects.create(student=self.st, amount_minor=24000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)
        confirm_payment(p, admin)
        # a pending payment must NOT count as income
        Payment.objects.create(student=self.st, amount_minor=99900, currency="PLN",
                               paid_at=date.today(), status=PaymentStatus.PENDING)

    def test_income_cash_basis_only_confirmed(self):
        inc = reports.income_for_period(date.today() - timedelta(days=1),
                                        date.today() + timedelta(days=1))
        self.assertEqual(inc.amount_minor, 24000)

    def test_income_by_group(self):
        rows = reports.income_by_group(date.today() - timedelta(days=1),
                                       date.today() + timedelta(days=1))
        self.assertEqual(rows[0][0], "Акулы")
        self.assertEqual(rows[0][1].amount_minor, 24000)

    def test_attendance_summary(self):
        tr = f.make_trainer()
        sess = create_session(trainer=tr, start_at=timezone.now(),
                              end_at=timezone.now() + timedelta(hours=1),
                              location="A", max_participants=10, group=self.g)
        create_subscription(student=self.st, subscription_type=f.make_sub_type(),
                            start_date=date.today() - timedelta(days=1))
        set_attendance(session_id=sess.id, student=self.st, status=AttendanceStatus.PRESENT)
        agg = reports.attendance_summary(student=self.st)
        self.assertEqual(agg["present"], 1)
        self.assertEqual(agg["total"], 1)


# ---------------- 5.10 Import / export ----------------
CSV = ("Фамилия;Имя;Телефон;Email;Группа;Абонемент\r\n"
       "Ковальский;Ян;+48500;jan@example.com;Дельфины;Абонемент 8\r\n"
       "Новак;Ева;+48600;ewa@example.com;Дельфины;\r\n"
       ";;;bad-email;;\r\n")  # error row: no name + invalid email


class ImportRule(TestCase):
    def setUp(self):
        f.make_sub_type(name="Абонемент 8", sessions=8)
        self.mapping = {"Фамилия": "last_name", "Имя": "first_name", "Телефон": "phone",
                        "Email": "email", "Группа": "group", "Абонемент": "subscription"}

    def test_parse_and_preview_classifies_rows(self):
        headers, rows = importer.parse_source(CSV.encode("utf-8"), "clients.csv")
        pv = importer.preview(headers, rows, self.mapping)
        statuses = [r.status for r in pv]
        self.assertEqual(statuses.count(NEW), 2)
        self.assertEqual(statuses.count(ERROR), 1)

    def test_preview_detects_existing_duplicate(self):
        Student.objects.create(parent=f.make_parent(), first_name="Ян", last_name="Ковальский",
                               email="jan@example.com")
        headers, rows = importer.parse_source(CSV.encode("utf-8"), "clients.csv")
        pv = importer.preview(headers, rows, self.mapping)
        self.assertTrue(any(r.status == DUPLICATE for r in pv))

    def test_commit_creates_students_group_and_subscription(self):
        headers, rows = importer.parse_source(CSV.encode("utf-8"), "clients.csv")
        pv = importer.preview(headers, rows, self.mapping)
        batch = importer.commit(pv, source_name="clients.csv")
        self.assertEqual(batch.rows_imported, 2)
        self.assertTrue(Group.objects.filter(name="Дельфины").exists())
        jan = Student.objects.get(email="jan@example.com")
        self.assertEqual(jan.subscriptions.count(), 1)  # subscription created

    def test_rollback_removes_everything(self):
        headers, rows = importer.parse_source(CSV.encode("utf-8"), "clients.csv")
        batch = importer.commit(importer.preview(headers, rows, self.mapping))
        importer.rollback(batch)
        batch.refresh_from_db()
        self.assertTrue(batch.is_rolled_back)
        self.assertEqual(Student.objects.filter(email="jan@example.com").count(), 0)

    def test_parse_xlsx(self):
        from openpyxl import Workbook
        wb = Workbook(); ws = wb.active
        ws.append(["Фамилия", "Имя", "Email"])
        ws.append(["Тест", "Юзер", "t@example.com"])
        buf = io.BytesIO(); wb.save(buf)
        headers, rows = importer.parse_source(buf.getvalue(), "c.xlsx")
        self.assertEqual(rows[0]["Email"], "t@example.com")

    def test_parse_rejects_excessive_rows_and_columns(self):
        too_many_columns = ";".join(f"C{i}" for i in range(51)) + "\n"
        with self.assertRaisesMessage(Exception, "50 столбцов"):
            importer.parse_source(too_many_columns.encode("utf-8"), "columns.csv")
        header = "Имя\n"
        too_many_rows = header + "\n".join("Ян" for _ in range(importer.MAX_IMPORT_ROWS + 1))
        with self.assertRaisesMessage(Exception, "5 000 строк"):
            importer.parse_source(too_many_rows.encode("utf-8"), "rows.csv")

    def test_rollback_preview_blocks_later_financial_data(self):
        headers, rows = importer.parse_source(CSV.encode("utf-8"), "clients.csv")
        batch = importer.commit(importer.preview(headers, rows, self.mapping))
        student = Student.objects.get(email="jan@example.com")
        Payment.objects.create(student=student, amount_minor=100, currency="PLN", paid_at=date.today())
        preview = importer.rollback_preview(batch)
        self.assertFalse(preview["can_rollback"])
        self.assertIn("payments", preview["blockers"][0]["dependencies"])

    def test_entity_export_xlsx_and_csv(self):
        f.make_student(first="Ан", last="Ков")
        name, content = exports.export_entity("clients", "xlsx")
        self.assertTrue(name.endswith(".xlsx"))
        self.assertGreater(len(content), 0)
        self.assertEqual(content[:2], b"PK")  # xlsx is a zip

    def test_preview_and_commit_are_reachable_over_http(self):
        # The importer above is exercised directly; this confirms the same
        # pipeline is actually wired to the admin API, not just importable.
        admin_client = Client()
        admin_client.force_login(f.make_admin(username="import_http_admin"))
        preview = admin_client.post("/api/admin/import/clients/preview/", {
            "file": SimpleUploadedFile("clients.csv", CSV.encode("utf-8"), content_type="text/csv"),
            "mapping": json.dumps(self.mapping),
        })
        self.assertEqual(preview.status_code, 200)
        rows = preview.json()["rows"]
        self.assertEqual(sum(1 for r in rows if r["status"] == NEW), 2)

        commit = admin_client.post(
            "/api/admin/import/clients/commit/",
            data=json.dumps({
                "batch_id": preview.json()["batch_id"],
                "selected_indices": [row["index"] for row in rows],
            }),
            content_type="application/json")
        self.assertEqual(commit.status_code, 201)
        self.assertEqual(commit.json()["rows_imported"], 2)
        name_csv, csv_bytes = exports.export_entity("clients", "csv")
        self.assertIn("Фамилия", csv_bytes.decode("utf-8"))


# ---------------- 5.6 Notifications ----------------
class NotificationSchedulerRule(TestCase):
    def _rule(self, offset_minutes=0, channel=Channel.EMAIL,
              event=EventType.PAYMENT_REMINDER):
        tmpl = NotificationTemplate.objects.create(
            event_type=event, channel=channel, subject="Оплата",
            body="{student}, оплатите {amount} до {date}." if channel != Channel.SMS
            else "Oplata {amount} do {date}")
        return NotificationRule.objects.create(event_type=event, channel=channel,
                                               template=tmpl, offset_minutes=offset_minutes)

    def _parent_with_consent(self, ctype=ConsentType.EMAIL, email="p@example.com"):
        parent = f.make_parent()
        parent.email = email; parent.save()
        c = Consent.objects.create(parent=parent, type=ctype)
        c.grant()
        return parent

    def test_no_consent_no_send(self):
        parent = f.make_parent()  # no consent
        st = Student.objects.create(parent=parent, first_name="Ян", last_name="К")
        Charge.objects.create(student=st, description="A", amount_minor=1000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self._rule(offset_minutes=0)
        res = run_scheduler()
        self.assertEqual(res["enqueued"], 0)
        self.assertEqual(NotificationLog.objects.count(), 0)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_due_reminder_sent_once(self):
        parent = self._parent_with_consent()
        st = Student.objects.create(parent=parent, first_name="Ян", last_name="К")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self._rule(offset_minutes=0)
        res = run_scheduler()
        self.assertEqual(res["enqueued"], 1)
        self.assertEqual(res["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        # idempotency: second run sends nothing new
        res2 = run_scheduler()
        self.assertEqual(res2["enqueued"], 0)
        self.assertEqual(NotificationLog.objects.filter(status=DeliveryStatus.SENT).count(), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_notification_uses_parent_preferred_language_translation(self):
        parent = self._parent_with_consent()
        parent.preferred_language = "pl"
        parent.save(update_fields=["preferred_language"])
        st = Student.objects.create(parent=parent, first_name="Jan", last_name="K")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        rule = self._rule(offset_minutes=0)
        NotificationTemplateTranslation.objects.create(
            template=rule.template,
            language_code="pl",
            subject="Platnosc",
            body="{student}, prosimy o platnosc {amount} do {date}.",
        )

        res = run_scheduler()
        log = NotificationLog.objects.get()

        self.assertEqual(res["sent"], 1)
        self.assertEqual(log.language_code, "pl")
        self.assertEqual(log.subject, "Platnosc")
        self.assertIn("prosimy o platnosc", log.body)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_offset_defers_send(self):
        parent = self._parent_with_consent()
        st = Student.objects.create(parent=parent, first_name="Ян", last_name="К")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() + timedelta(days=10))
        self._rule(offset_minutes=-3 * 24 * 60)  # send 3 days before -> 7 days from now
        res = run_scheduler()
        self.assertEqual(res["enqueued"], 0)  # not due yet

    def test_delivery_failure_retries_then_failed(self):
        # consent present but no email -> EmailBackend raises -> retries accumulate
        parent = self._parent_with_consent(email="")
        parent.user.email = ""; parent.user.save()
        st = Student.objects.create(parent=parent, first_name="Ян", last_name="К")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self._rule(offset_minutes=0)
        run_scheduler()
        log = NotificationLog.objects.get()
        self.assertEqual(log.status, DeliveryStatus.QUEUED)  # 1st soft failure
        self.assertEqual(log.retries, 1)
        deliver_pending(); deliver_pending()
        log.refresh_from_db()
        self.assertEqual(log.status, DeliveryStatus.FAILED)
        self.assertEqual(log.retries, 3)

    def test_unsupported_legacy_channel_is_failed_without_crashing_delivery(self):
        parent = f.make_parent()
        log = NotificationLog.objects.create(
            recipient=parent,
            event_type=EventType.MASS_MAILING,
            channel="push",
            status=DeliveryStatus.QUEUED,
            payload={"body": "hello"},
        )

        result = deliver_pending()
        log.refresh_from_db()

        self.assertEqual(result["failed"], 1)
        self.assertEqual(log.status, DeliveryStatus.FAILED)
        self.assertIn("Unsupported notification channel", log.error)

    def test_sms_channel_gated_by_sms_consent(self):
        parent = f.make_parent(); parent.phone = "+48500"; parent.save()
        # only email consent -> sms not allowed
        Consent.objects.create(parent=parent, type=ConsentType.EMAIL).grant()
        self.assertFalse(channel_allowed(parent, Channel.SMS))
        Consent.objects.create(parent=parent, type=ConsentType.SMS).grant()
        self.assertTrue(channel_allowed(parent, Channel.SMS))

    @override_settings(SMS_DRY_RUN=True)
    def test_sms_delivery_records_rendered_body_and_provider_id(self):
        SmsBackend.sent_messages.clear()
        parent = f.make_parent()
        parent.phone = "+48500111222"
        parent.save()
        Consent.objects.create(parent=parent, type=ConsentType.SMS).grant()
        st = Student.objects.create(parent=parent, first_name="Jan", last_name="K")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self._rule(offset_minutes=0, channel=Channel.SMS)

        res = run_scheduler()
        log = NotificationLog.objects.get()

        self.assertEqual(res["sent"], 1)
        self.assertEqual(SmsBackend.sent_messages[0][0], "+48500111222")
        self.assertEqual(log.status, DeliveryStatus.SENT)
        self.assertIn("Oplata", log.body)
        self.assertTrue(log.provider_message_id.startswith("sms:dry:"))
        self.assertIsNotNone(log.last_attempt_at)

    @override_settings(TELEGRAM_DRY_RUN=True)
    def test_telegram_delivery_uses_chat_id(self):
        TelegramBackend.sent_messages.clear()
        parent = f.make_parent()
        parent.telegram_chat_id = "123456"
        parent.save()
        st = Student.objects.create(parent=parent, first_name="Jan", last_name="K")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date.today() - timedelta(days=1))
        self._rule(offset_minutes=0, channel=Channel.TELEGRAM)

        res = run_scheduler()
        log = NotificationLog.objects.get()

        self.assertEqual(res["sent"], 1)
        self.assertEqual(TelegramBackend.sent_messages[0][0], "123456")
        self.assertTrue(log.provider_message_id.startswith("telegram:dry:"))

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_quiet_hours_defer_and_resume_at_allowed_time(self):
        parent = self._parent_with_consent()
        st = Student.objects.create(parent=parent, first_name="Jan", last_name="K")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date(2026, 7, 14))
        self._rule(offset_minutes=0)
        QuietHoursPolicy.objects.create(
            channel=Channel.EMAIL,
            starts_at=time(22, 0),
            ends_at=time(8, 0),
            timezone="Europe/Warsaw",
        )
        quiet_now = timezone.make_aware(datetime(2026, 7, 15, 23, 30))

        result = run_scheduler(now=quiet_now)
        log = NotificationLog.objects.get()

        self.assertEqual(result["enqueued"], 1)
        self.assertEqual(result["deferred"], 1)
        self.assertEqual(log.status, DeliveryStatus.DEFERRED)
        self.assertEqual(timezone.localtime(log.scheduled_at).strftime("%H:%M"), "08:00")
        self.assertEqual(len(mail.outbox), 0)

        allowed_now = timezone.make_aware(datetime(2026, 7, 16, 8, 1))
        delivered = deliver_pending(now=allowed_now)
        log.refresh_from_db()

        self.assertEqual(delivered["sent"], 1)
        self.assertEqual(log.status, DeliveryStatus.SENT)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", SMS_DRY_RUN=True)
    def test_quiet_hours_are_channel_specific(self):
        SmsBackend.sent_messages.clear()
        parent = self._parent_with_consent()
        sms_consent = Consent.objects.create(parent=parent, type=ConsentType.SMS)
        sms_consent.grant()
        st = Student.objects.create(parent=parent, first_name="Jan", last_name="K")
        Charge.objects.create(student=st, description="A", amount_minor=24000, currency="PLN",
                              due_date=date(2026, 7, 14))
        self._rule(offset_minutes=0, channel=Channel.EMAIL)
        self._rule(offset_minutes=0, channel=Channel.SMS)
        QuietHoursPolicy.objects.create(
            channel=Channel.EMAIL,
            starts_at=time(22, 0),
            ends_at=time(8, 0),
            timezone="Europe/Warsaw",
        )

        result = run_scheduler(now=timezone.make_aware(datetime(2026, 7, 15, 23, 30)))
        email_log = NotificationLog.objects.get(channel=Channel.EMAIL)
        sms_log = NotificationLog.objects.get(channel=Channel.SMS)

        self.assertEqual(result["enqueued"], 2)
        self.assertEqual(result["deferred"], 1)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(email_log.status, DeliveryStatus.DEFERRED)
        self.assertEqual(sms_log.status, DeliveryStatus.SENT)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(len(SmsBackend.sent_messages), 1)
