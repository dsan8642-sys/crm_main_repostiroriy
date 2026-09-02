import json
import tempfile
from datetime import date

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from billing.models import (
    Charge, ChargeReversal, Payment, PaymentEventType, PaymentMethod,
    PaymentSource, PaymentStatus,
)
from billing.services import confirm_payment, reject_payment, student_balance
from subscriptions.models import Subscription

from . import factories as f


PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


class Wave4FinancialSafetyRule(TestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self._media_override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._media_override.enable()
        self.addCleanup(self._media_override.disable)
        self.addCleanup(self._media_root.cleanup)
        self.parent = f.make_parent(username="wave4_parent")
        self.other_parent = f.make_parent(username="wave4_other")
        self.student = f.make_student(parent=self.parent, first="Ada", last="Nowak")
        self.other_student = f.make_student(parent=self.other_parent, first="Jan", last="Kowalski")
        self.admin = f.make_admin(username="wave4_admin")

    def receipt(self, name="proof.pdf"):
        return SimpleUploadedFile(name, PDF, content_type="application/pdf")

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def top_up(self, *, key=None, amount_minor=20050, student=None):
        data = {
            "student_id": str((student or self.student).id),
            "amount_minor": str(amount_minor),
            "currency": "PLN",
            "file": self.receipt(),
        }
        if key is not None:
            data["idempotency_key"] = key
        return self.client.post("/api/client/payments/top-up-requests/", data=data)

    def admin_payment(self, *, key, amount_minor=20050, confirm=True):
        return self.post_json("/api/admin/payments/", {
            "participant_id": self.student.id,
            "amount_minor": amount_minor,
            "currency": "PLN",
            "paid_at": "2026-08-15",
            "method": "cash",
            "comment": "Wave 4 synthetic payment",
            "confirm": confirm,
            "idempotency_key": key,
        })

    def admin_charge(self, *, key=None, amount_minor=5000,
                     description="Wave 4 manual charge"):
        payload = {
            "participant_id": self.student.id,
            "amount_minor": amount_minor,
            "currency": "PLN",
            "due_date": "2026-08-15",
            "description": description,
        }
        if key is not None:
            payload["idempotency_key"] = key
        return self.post_json(
            f"/api/admin/participants/{self.student.id}/charges/", payload)

    def test_top_up_requires_key_and_creates_nothing_when_missing(self):
        self.client.force_login(self.parent.user)
        response = self.top_up()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.count(), 0)

    def test_top_up_replay_creates_one_pending_payment_receipt_and_event(self):
        self.client.force_login(self.parent.user)
        first = self.top_up(key="wave4-client-topup-0001")
        second = self.top_up(key="wave4-client-topup-0001")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["top_up_request"]["idempotent_replay"])
        payment = Payment.objects.get()
        self.assertEqual(payment.status, PaymentStatus.PENDING)
        self.assertEqual(payment.source, PaymentSource.CLIENT_TOP_UP)
        self.assertEqual(payment.receipts.count(), 1)
        self.assertEqual(payment.events.filter(event_type=PaymentEventType.REQUESTED).count(), 1)
        self.assertEqual(student_balance(self.student).amount_minor, 0)

    def test_reused_top_up_key_with_changed_amount_fails_closed(self):
        self.client.force_login(self.parent.user)
        self.assertEqual(self.top_up(key="wave4-client-topup-0002").status_code, 201)
        response = self.top_up(key="wave4-client-topup-0002", amount_minor=20051)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.count(), 1)

    def test_foreign_or_inactive_participant_cannot_receive_top_up(self):
        self.client.force_login(self.parent.user)
        foreign = self.top_up(key="wave4-client-topup-0003", student=self.other_student)
        self.assertEqual(foreign.status_code, 404)
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        inactive = self.top_up(key="wave4-client-topup-0004")
        self.assertEqual(inactive.status_code, 400)
        self.assertEqual(Payment.objects.count(), 0)

    def test_admin_payment_replay_is_single_confirmed_payment_with_readback(self):
        self.client.force_login(self.admin)
        first = self.admin_payment(key="wave4-admin-payment-0001")
        second = self.admin_payment(key="wave4-admin-payment-0001")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["idempotent_replay"])
        payment = Payment.objects.get()
        self.assertEqual(payment.status, PaymentStatus.CONFIRMED)
        self.assertEqual(payment.events.count(), 2)
        self.assertEqual(payment.events.filter(event_type=PaymentEventType.CONFIRMED).count(), 1)
        self.assertEqual(first.json()["balance_minor"], -20050)
        self.assertEqual(student_balance(self.student).amount_minor, -20050)

    def test_zero_admin_payment_creates_nothing(self):
        self.client.force_login(self.admin)
        response = self.admin_payment(key="wave4-admin-payment-0002", amount_minor=0)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.count(), 0)

    def test_manual_charge_requires_key_and_exact_replay_returns_readback(self):
        self.client.force_login(self.admin)
        missing = self.admin_charge()
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(Charge.objects.count(), 0)

        first = self.admin_charge(key="wave4-admin-charge-0001")
        second = self.admin_charge(key="wave4-admin-charge-0001")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertFalse(first.json()["idempotent_replay"])
        self.assertTrue(second.json()["idempotent_replay"])
        self.assertEqual(first.json()["balance_minor"], 5000)
        self.assertEqual(first.json()["balance_currency"], "PLN")
        self.assertEqual(Charge.objects.count(), 1)
        self.assertEqual(student_balance(self.student).amount_minor, 5000)

    def test_manual_charge_replay_with_changed_payload_returns_conflict(self):
        self.client.force_login(self.admin)
        self.assertEqual(
            self.admin_charge(key="wave4-admin-charge-0002").status_code,
            201,
        )
        changed = self.admin_charge(
            key="wave4-admin-charge-0002", amount_minor=5001)
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(changed.json()["code"], "idempotency_conflict")
        self.assertEqual(Charge.objects.count(), 1)
        self.assertEqual(student_balance(self.student).amount_minor, 5000)

    def test_manual_charge_full_reversal_is_append_only_and_idempotent(self):
        self.client.force_login(self.admin)
        charge = self.admin_charge(key="wave4-admin-charge-0003").json()
        path = f"/api/admin/charges/{charge['id']}/reverse/"
        payload = {
            "reason": "Начисление создано ошибочно",
            "idempotency_key": "wave4-charge-reversal-0001",
        }

        first = self.post_json(path, payload)
        second = self.post_json(path, payload)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(first.json()["idempotent_replay"])
        self.assertTrue(second.json()["idempotent_replay"])
        self.assertEqual(first.json()["status"], "reversed")
        self.assertEqual(first.json()["balance_minor"], 0)
        self.assertEqual(
            first.json()["reversal"]["reason"], payload["reason"])
        self.assertEqual(Charge.objects.count(), 1)
        self.assertEqual(ChargeReversal.objects.count(), 1)
        self.assertEqual(student_balance(self.student).amount_minor, 0)

        changed = self.post_json(path, {**payload, "reason": "Другая причина"})
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(ChargeReversal.objects.count(), 1)
        self.assertEqual(student_balance(self.student).amount_minor, 0)

        self.client.force_login(self.parent.user)
        history = self.client.get(
            f"/api/client/payments/?participant_id={self.student.id}")
        self.assertEqual(history.status_code, 200)
        history_charge = history.json()["charges"][0]
        self.assertEqual(history_charge["status"], "reversed")
        self.assertEqual(history_charge["outstanding_minor"], 0)
        self.assertEqual(history_charge["reversal"]["reason"], payload["reason"])

    def test_subscription_charge_cannot_use_manual_reversal_endpoint(self):
        self.client.force_login(self.admin)
        subscription_type = f.make_sub_type(name="Protected subscription charge")
        subscription = Subscription.objects.create(
            student=self.student,
            subscription_type=subscription_type,
            start_date=date(2026, 8, 15),
            base_end_date=date(2026, 9, 14),
        )
        charge = Charge.objects.create(
            student=self.student,
            subscription=subscription,
            description=subscription_type.name,
            amount_minor=subscription_type.price_minor,
            currency=subscription_type.currency,
            due_date=subscription.start_date,
            created_by=self.admin,
        )

        response = self.post_json(
            f"/api/admin/charges/{charge.id}/reverse/",
            {
                "reason": "Недопустимая отмена",
                "idempotency_key": "wave4-charge-reversal-0002",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["charge"][0]["code"], "manual_only")
        self.assertEqual(ChargeReversal.objects.count(), 0)
        self.assertEqual(student_balance(self.student).amount_minor, charge.amount_minor)

    def test_reject_reason_is_required_and_same_state_retry_is_harmless(self):
        self.client.force_login(self.admin)
        created = self.admin_payment(key="wave4-admin-payment-0003", confirm=False)
        payment_id = created.json()["id"]
        blank = self.post_json(f"/api/admin/payments/{payment_id}/reject/", {"reason": "  "})
        self.assertEqual(blank.status_code, 400)
        payment = Payment.objects.get(pk=payment_id)
        self.assertEqual(payment.status, PaymentStatus.PENDING)
        self.assertEqual(payment.events.count(), 1)
        first = self.post_json(f"/api/admin/payments/{payment_id}/reject/", {"reason": "Сумма не найдена"})
        second = self.post_json(f"/api/admin/payments/{payment_id}/reject/", {"reason": "Повтор запроса"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentStatus.REJECTED)
        self.assertEqual(payment.events.filter(event_type=PaymentEventType.REJECTED).count(), 1)

    def test_stale_confirm_and_reject_views_cannot_create_conflicting_outcomes(self):
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=20050,
            currency="PLN",
            paid_at=date(2026, 8, 15),
            method=PaymentMethod.CASH,
            source=PaymentSource.ADMIN,
            status=PaymentStatus.PENDING,
        )
        confirm_view = Payment.objects.get(pk=payment.pk)
        reject_view = Payment.objects.get(pk=payment.pk)
        confirm_payment(confirm_view, self.admin)
        with self.assertRaises(ValidationError):
            reject_payment(reject_view, self.admin, "Старая конкурентная команда")
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentStatus.CONFIRMED)
        self.assertEqual(payment.events.filter(event_type=PaymentEventType.CONFIRMED).count(), 1)
        self.assertEqual(payment.events.filter(event_type=PaymentEventType.REJECTED).count(), 0)
