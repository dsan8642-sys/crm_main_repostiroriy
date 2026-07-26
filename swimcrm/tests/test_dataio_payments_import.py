"""Import/export module 5.10 extension: payment history import."""
from django.test import TestCase

from billing.models import Payment, PaymentEvent, PaymentEventType, PaymentMethod, PaymentStatus
from dataio import payments_importer as pi
from dataio.importer import parse_source

from . import factories as f


def _csv(rows, *, reference=False):
    header = "Клиент;Сумма;Валюта;Дата;Способ;Статус;Комментарий"
    if reference:
        header += ";Reference ID"
    header += "\r\n"
    return (header + "\r\n".join(rows) + "\r\n").encode("utf-8")


class PaymentsImportPreviewTest(TestCase):
    def setUp(self):
        self.student = f.make_student(first="Ян", last="Ковальский", email="jan.pi@example.com")

    def test_new_row_resolves_and_validates(self):
        row = "jan.pi@example.com;120.00;PLN;10.03.2026;cash;confirmed;тест"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.NEW)
        self.assertEqual(pv[0].resolved["amount_minor"], 12000)
        self.assertEqual(pv[0].resolved["method"], PaymentMethod.CASH)
        self.assertEqual(pv[0].resolved["status"], PaymentStatus.CONFIRMED)

    def test_blank_status_and_currency_default_to_confirmed_pln(self):
        row = "jan.pi@example.com;50;;10.03.2026;;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.NEW)
        self.assertEqual(pv[0].resolved["currency"], "PLN")
        self.assertEqual(pv[0].resolved["status"], PaymentStatus.CONFIRMED)
        self.assertEqual(pv[0].resolved["method"], PaymentMethod.CASH)

    def test_accepts_russian_method_label(self):
        row = "jan.pi@example.com;50;PLN;10.03.2026;Bank transfer;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.NEW)
        self.assertEqual(pv[0].resolved["method"], PaymentMethod.TRANSFER)

    def test_transfer_alias_is_normalized(self):
        row = "jan.pi@example.com;50;PLN;10.03.2026;transfer;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.NEW)
        self.assertEqual(pv[0].resolved["method"], PaymentMethod.TRANSFER)

    def test_unknown_client_is_an_error(self):
        row = "ghost@example.com;50;PLN;10.03.2026;cash;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.ERROR)
        self.assertTrue(any("не найден" in e for e in pv[0].errors))

    def test_negative_or_zero_amount_is_an_error(self):
        row = "jan.pi@example.com;0;PLN;10.03.2026;cash;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.ERROR)

    def test_unsupported_currency_is_an_error(self):
        row = "jan.pi@example.com;50;GBP;10.03.2026;cash;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.ERROR)

    def test_rejects_amount_with_excess_precision(self):
        headers, rows = parse_source(
            _csv(["jan.pi@example.com;50.001;PLN;10.03.2026;cash;;"]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.ERROR)
        self.assertIn("больше 2", pv[0].errors[0])

    def test_reference_id_prevents_duplicate_without_guessing(self):
        Payment.objects.create(student=self.student, amount_minor=12000, currency="PLN",
                               paid_at="2026-03-10", method=PaymentMethod.CASH,
                               reference_id="bank-123", status=PaymentStatus.CONFIRMED)
        headers, rows = parse_source(
            _csv(["jan.pi@example.com;120.00;PLN;10.03.2026;cash;confirmed;;bank-123"], reference=True),
            "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.DUPLICATE)

    def test_match_without_reference_requires_manual_decision(self):
        Payment.objects.create(student=self.student, amount_minor=12000, currency="PLN",
                               paid_at="2026-03-10", method=PaymentMethod.CASH,
                               status=PaymentStatus.CONFIRMED)
        headers, rows = parse_source(
            _csv(["jan.pi@example.com;120.00;PLN;10.03.2026;cash;confirmed;"]), "pay.csv")
        self.assertEqual(pi.preview(headers, rows)[0].status, pi.POSSIBLE_DUPLICATE)

    def test_bad_date_is_an_error(self):
        row = "jan.pi@example.com;50;PLN;not-a-date;cash;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.ERROR)

    def test_flags_duplicate_when_matching_payment_exists(self):
        Payment.objects.create(student=self.student, amount_minor=12000, currency="PLN",
                               paid_at="2026-03-10", method=PaymentMethod.CASH,
                               status=PaymentStatus.CONFIRMED)
        row = "jan.pi@example.com;120.00;PLN;10.03.2026;cash;confirmed;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.POSSIBLE_DUPLICATE)


class PaymentsImportCommitTest(TestCase):
    def setUp(self):
        self.student = f.make_student(first="Ева", last="Новак", email="ewa.pi@example.com")

    def test_commit_creates_confirmed_payment_with_event_trail(self):
        row = "ewa.pi@example.com;150.50;PLN;12.03.2026;card;confirmed;импорт"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        self.assertEqual(pv[0].status, pi.NEW)

        summary = pi.commit(pv, actor=None)
        self.assertEqual(summary["created"], 1)
        self.assertEqual(summary["skipped"], 0)
        self.assertEqual(summary["errors"], [])

        payment = Payment.objects.get(student=self.student)
        self.assertEqual(payment.amount_minor, 15050)
        self.assertEqual(payment.status, PaymentStatus.CONFIRMED)
        self.assertIsNotNone(payment.confirmed_at)
        self.assertEqual(
            set(PaymentEvent.objects.filter(payment=payment).values_list("event_type", flat=True)),
            {PaymentEventType.CREATED, PaymentEventType.CONFIRMED})

    def test_commit_defaults_missing_status_to_confirmed(self):
        row = "ewa.pi@example.com;10;PLN;12.03.2026;cash;;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        pi.commit(pv, actor=None)
        payment = Payment.objects.get(student=self.student)
        self.assertEqual(payment.status, PaymentStatus.CONFIRMED)

    def test_commit_rejected_status_leaves_balance_untouched(self):
        row = "ewa.pi@example.com;10;PLN;12.03.2026;cash;rejected;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        pi.commit(pv, actor=None)
        payment = Payment.objects.get(student=self.student)
        self.assertEqual(payment.status, PaymentStatus.REJECTED)

    def test_commit_does_not_duplicate_when_same_payment_already_committed(self):
        row = "ewa.pi@example.com;10;PLN;12.03.2026;cash;confirmed;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        pi.commit(pv, actor=None)

        # Re-run preview against the now-changed DB state: the same row is a
        # duplicate and commit must not create a second Payment for it.
        pv2 = pi.preview(headers, rows)
        self.assertEqual(pv2[0].status, pi.POSSIBLE_DUPLICATE)
        summary2 = pi.commit(pv2, actor=None)
        self.assertEqual(summary2["created"], 0)
        self.assertEqual(Payment.objects.filter(student=self.student).count(), 1)

    def test_committed_payment_cannot_be_deleted(self):
        row = "ewa.pi@example.com;10;PLN;12.03.2026;cash;confirmed;"
        headers, rows = parse_source(_csv([row]), "pay.csv")
        pv = pi.preview(headers, rows)
        pi.commit(pv, actor=None)
        payment = Payment.objects.get(student=self.student)
        with self.assertRaises(Exception):
            payment.delete()

    def test_possible_duplicate_needs_explicit_approval(self):
        Payment.objects.create(student=self.student, amount_minor=1000, currency="PLN",
                               paid_at="2026-03-12", method=PaymentMethod.CASH,
                               status=PaymentStatus.CONFIRMED)
        headers, rows = parse_source(
            _csv(["ewa.pi@example.com;10;PLN;12.03.2026;cash;confirmed;"]), "pay.csv")
        preview = pi.preview(headers, rows)
        self.assertEqual(preview[0].status, pi.POSSIBLE_DUPLICATE)
        self.assertEqual(pi.commit(preview)["created"], 0)
        self.assertEqual(pi.commit(preview, approve_possible_duplicates=True)["created"], 1)
