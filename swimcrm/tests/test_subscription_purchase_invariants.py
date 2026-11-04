import json
from datetime import date, timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from analytics.debtors import debtors
from billing.models import Charge, ChargeReversal, Payment, PaymentStatus
from billing.services import family_balance
from subscriptions.models import LedgerReason, SessionLedgerEntry, Subscription

from . import factories as f


class SubscriptionPurchaseApiInvariantTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="subscription_invariant_admin")
        self.student = f.make_student(first="Billing", last="Invariant")
        self.subscription_type = f.make_sub_type(
            name="4 тренировки",
            sessions=4,
            days=30,
            price_minor=28000,
        )
        self.client.force_login(self.admin)

    def test_cancel_paid_unused_sale_credits_family_account_once(self):
        sale = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "payment_received": True, "payment_method": "cash",
                             "payment_date": "2026-08-26", "idempotency_key": "cancel-paid-sale"}),
            content_type="application/json",
        )
        self.assertEqual(sale.status_code, 201)
        subscription_id = sale.json()["subscription"]["id"]
        url = f"/api/admin/subscriptions/{subscription_id}/cancel-sale/"
        self.assertEqual(family_balance(self.student.parent).amount_minor, 0)
        self.assertTrue(self.client.get(f"/api/admin/subscriptions/{subscription_id}/").json()["can_cancel_sale"])
        cancelled = self.client.post(url, data="{}", content_type="application/json")
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["balance_minor"], -28000)
        self.assertEqual(cancelled.json()["subscription"]["status"], "cancelled")
        self.assertEqual(cancelled.json()["subscription"]["remaining_sessions"], 0)
        self.assertEqual(ChargeReversal.objects.filter(charge__subscription_id=subscription_id).count(), 1)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(self.client.post(url, data="{}", content_type="application/json").status_code, 400)
        self.assertEqual(family_balance(self.student.parent).amount_minor, -28000)

    def test_cancel_unpaid_sale_removes_debt_without_payment(self):
        sale = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "idempotency_key": "cancel-unpaid-sale"}),
            content_type="application/json",
        )
        subscription_id = sale.json()["subscription"]["id"]
        self.assertEqual(family_balance(self.student.parent).amount_minor, 28000)
        self.assertEqual(self.client.post(
            f"/api/admin/subscriptions/{subscription_id}/cancel-sale/",
            data="{}", content_type="application/json").status_code, 200)
        self.assertEqual(family_balance(self.student.parent).amount_minor, 0)
        self.assertEqual(Payment.objects.count(), 0)

    def test_unpaid_sale_with_future_start_is_owed_today(self):
        today = timezone.localdate()
        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "start_date": (today + timedelta(days=7)).isoformat(),
                             "idempotency_key": "unpaid-sale-today"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["charge"]["due_date"], today.isoformat())
        self.assertEqual(debtors()[0].balance_minor, 28000)

    def test_cancel_rejects_used_then_restored_sessions_and_generic_status_bypass(self):
        sale = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "idempotency_key": "cancel-used-sale"}),
            content_type="application/json",
        )
        subscription = Subscription.objects.get(pk=sale.json()["subscription"]["id"])
        SessionLedgerEntry.objects.create(subscription=subscription, delta=-1, reason=LedgerReason.ATTENDANCE)
        SessionLedgerEntry.objects.create(subscription=subscription, delta=1, reason=LedgerReason.MANUAL)
        self.assertEqual(subscription.remaining_sessions, 4)
        self.assertEqual(self.client.post(
            f"/api/admin/subscriptions/{subscription.pk}/cancel-sale/",
            data="{}", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post(
            f"/api/admin/subscriptions/{subscription.pk}/",
            data=json.dumps({"status": "cancelled"}),
            content_type="application/json").status_code, 400)
        self.assertEqual(ChargeReversal.objects.count(), 0)

    def test_cancel_rejects_any_change_from_sold_session_count(self):
        for delta in (-1, 1):
            with self.subTest(delta=delta):
                sale = self.client.post(
                    f"/api/admin/participants/{self.student.id}/subscriptions/",
                    data=json.dumps({"subscription_type_id": self.subscription_type.id,
                                     "idempotency_key": f"cancel-balance-{delta}"}),
                    content_type="application/json",
                )
                self.assertEqual(sale.status_code, 201)
                subscription = Subscription.objects.get(pk=sale.json()["subscription"]["id"])
                SessionLedgerEntry.objects.create(
                    subscription=subscription, delta=delta, reason=LedgerReason.MANUAL,
                )
                url = f"/api/admin/subscriptions/{subscription.pk}/"
                self.assertEqual(subscription.remaining_sessions, 4 + delta)
                self.assertFalse(self.client.get(url).json()["can_cancel_sale"])
                self.assertEqual(self.client.post(
                    f"{url}cancel-sale/", data="{}", content_type="application/json",
                ).status_code, 400)
                self.assertFalse(ChargeReversal.objects.filter(charge__subscription=subscription).exists())
                subscription.refresh_from_db()
                self.assertNotEqual(subscription.status, "cancelled")

    def test_create_charge_false_still_creates_the_subscription_charge(self):
        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "start_date": "2026-08-26",
                "due_date": "2026-08-29",
                "create_charge": False,
                "idempotency_key": "subscription-charge-false-001",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["charge"]["amount_minor"], 28000)
        self.assertEqual(payload["charge"]["currency"], "PLN")
        self.assertEqual(payload["charge"]["due_date"], "2026-08-29")
        self.assertEqual(
            Charge.objects.filter(
                subscription_id=payload["subscription"]["id"],
            ).count(),
            1,
        )
        self.assertEqual(Subscription.objects.filter(student=self.student).count(), 1)

    def test_same_idempotency_key_replays_the_original_purchase(self):
        request_data = {
            "subscription_type_id": self.subscription_type.id,
            "start_date": "2026-08-26",
            "due_date": "2026-08-29",
            "idempotency_key": "subscription-sale-001",
        }

        first = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps(request_data),
            content_type="application/json",
        )
        replay = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps(request_data),
            content_type="application/json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["replayed"])
        self.assertEqual(
            replay.json()["subscription"]["id"],
            first.json()["subscription"]["id"],
        )
        self.assertEqual(replay.json()["charge"]["id"], first.json()["charge"]["id"])
        self.assertEqual(Subscription.objects.filter(student=self.student).count(), 1)
        self.assertEqual(Charge.objects.filter(student=self.student).count(), 1)

    def test_purchase_can_record_matching_confirmed_payment_once(self):
        request_data = {
            "subscription_type_id": self.subscription_type.id,
            "start_date": "2026-08-26",
            "due_date": "2026-08-29",
            "payment_received": True,
            "payment_method": "bank_transfer",
            "payment_date": "2026-08-26",
            "idempotency_key": "subscription-paid-sale-001",
        }
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"

        first = self.client.post(
            url, data=json.dumps(request_data), content_type="application/json")
        replay = self.client.post(
            url, data=json.dumps(request_data), content_type="application/json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.json()["charge"]["amount_minor"], 28000)
        self.assertEqual(first.json()["payment"]["amount_minor"], 28000)
        self.assertEqual(first.json()["payment"]["status"], PaymentStatus.CONFIRMED)
        self.assertEqual(first.json()["payment"]["method"], "bank_transfer")
        self.assertEqual(replay.json()["payment"]["id"], first.json()["payment"]["id"])
        self.assertEqual(Payment.objects.filter(student=self.student).count(), 1)

    def test_discounted_sale_charges_and_pays_sale_price_and_replays(self):
        data = {
            "subscription_type_id": self.subscription_type.id,
            "price_minor": 20000,
            "payment_received": True,
            "payment_method": "cash",
            "payment_date": "2026-10-20",
            "idempotency_key": "discounted-sale",
        }
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"
        first = self.client.post(url, data=json.dumps(data), content_type="application/json")
        replay = self.client.post(url, data=json.dumps(data), content_type="application/json")
        conflict = self.client.post(url, data=json.dumps({**data, "price_minor": 19000}), content_type="application/json")
        self.assertEqual((first.status_code, replay.status_code, conflict.status_code), (201, 200, 409))
        self.assertEqual(first.json()["charge"]["amount_minor"], 20000)
        self.assertEqual(first.json()["payment"]["amount_minor"], 20000)
        self.assertEqual(self.subscription_type.price_minor, 28000)
        subscription_id = first.json()["subscription"]["id"]
        cancelled = self.client.post(f"/api/admin/subscriptions/{subscription_id}/cancel-sale/", data="{}", content_type="application/json")
        self.assertEqual(cancelled.json()["balance_minor"], -20000)

    def test_sale_price_bounds_and_free_sale_cancellation(self):
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"
        for price in (-1, 28001, "oops"):
            response = self.client.post(url, data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "price_minor": price, "idempotency_key": f"invalid-{price}",
            }), content_type="application/json")
            self.assertEqual(response.status_code, 400)
        self.assertFalse(Subscription.objects.filter(student=self.student).exists())
        free = self.client.post(url, data=json.dumps({
            "subscription_type_id": self.subscription_type.id,
            "price_minor": 0, "idempotency_key": "free-sale",
        }), content_type="application/json")
        self.assertEqual(free.status_code, 201)
        self.assertEqual(free.json()["charge"]["amount_minor"], 0)
        subscription_id = free.json()["subscription"]["id"]
        self.assertEqual(self.client.post(f"/api/admin/subscriptions/{subscription_id}/cancel-sale/", data="{}", content_type="application/json").status_code, 200)
        self.assertEqual(ChargeReversal.objects.get(charge__subscription_id=subscription_id).amount_minor, 0)
        rejected = self.client.post(url, data=json.dumps({
            "subscription_type_id": self.subscription_type.id,
            "price_minor": 0, "payment_received": True,
            "payment_method": "cash", "payment_date": "2026-10-20",
            "idempotency_key": "free-with-payment",
        }), content_type="application/json")
        self.assertEqual(rejected.status_code, 400)

    def test_payment_fields_are_part_of_subscription_idempotency(self):
        request_data = {
            "subscription_type_id": self.subscription_type.id,
            "payment_received": True,
            "payment_method": "cash",
            "payment_date": "2026-08-26",
            "idempotency_key": "subscription-paid-conflict-001",
        }
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"
        first = self.client.post(
            url, data=json.dumps(request_data), content_type="application/json")
        conflict = self.client.post(
            url,
            data=json.dumps({**request_data, "payment_method": "card"}),
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(Payment.objects.filter(student=self.student).count(), 1)

    def test_paid_purchase_requires_valid_payment_details_without_partial_write(self):
        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "payment_received": True,
                "payment_method": "wire",
                "payment_date": "2026-08-26",
                "idempotency_key": "subscription-paid-invalid-001",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Subscription.objects.filter(student=self.student).exists())
        self.assertFalse(Charge.objects.filter(student=self.student).exists())
        self.assertFalse(Payment.objects.filter(student=self.student).exists())

    def test_reusing_idempotency_key_with_different_purchase_data_is_conflict(self):
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"
        original = {
            "subscription_type_id": self.subscription_type.id,
            "start_date": "2026-08-26",
            "due_date": "2026-08-29",
            "idempotency_key": "subscription-sale-conflict-001",
        }
        changed = {**original, "due_date": "2026-08-30"}

        first = self.client.post(
            url, data=json.dumps(original), content_type="application/json")
        conflict = self.client.post(
            url, data=json.dumps(changed), content_type="application/json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["code"], "idempotency_conflict")
        self.assertEqual(Subscription.objects.filter(student=self.student).count(), 1)
        self.assertEqual(Charge.objects.filter(student=self.student).count(), 1)

    def test_exact_replay_survives_later_client_archive_and_type_deactivation(self):
        request_data = {
            "subscription_type_id": self.subscription_type.id,
            "start_date": "2026-08-26",
            "due_date": "2026-08-29",
            "idempotency_key": "subscription-state-independent-replay-001",
        }
        url = f"/api/admin/participants/{self.student.id}/subscriptions/"
        first = self.client.post(
            url, data=json.dumps(request_data), content_type="application/json")

        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        self.subscription_type.is_active = False
        self.subscription_type.save(update_fields=["is_active"])
        replay = self.client.post(
            url, data=json.dumps(request_data), content_type="application/json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["replayed"])
        self.assertEqual(
            replay.json()["subscription"]["id"],
            first.json()["subscription"]["id"],
        )

    def test_renewal_with_false_always_charges_and_replays_by_key(self):
        original_response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "start_date": "2026-08-26",
                "idempotency_key": "subscription-original-001",
            }),
            content_type="application/json",
        )
        original_id = original_response.json()["subscription"]["id"]
        renewal_type = f.make_sub_type(
            name="8 тренировок",
            sessions=8,
            days=45,
            price_minor=52000,
        )
        renewal_data = {
            "subscription_type_id": renewal_type.id,
            "start_date": "2026-09-26",
            "due_date": "2026-09-30",
            "create_charge": False,
            "idempotency_key": "subscription-renewal-001",
        }

        first = self.client.post(
            f"/api/admin/subscriptions/{original_id}/renew/",
            data=json.dumps(renewal_data),
            content_type="application/json",
        )
        replay = self.client.post(
            f"/api/admin/subscriptions/{original_id}/renew/",
            data=json.dumps(renewal_data),
            content_type="application/json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.json()["charge"]["amount_minor"], 52000)
        self.assertEqual(first.json()["charge"]["due_date"], "2026-09-30")
        self.assertEqual(
            replay.json()["subscription"]["id"],
            first.json()["subscription"]["id"],
        )
        self.assertEqual(replay.json()["charge"]["id"], first.json()["charge"]["id"])
        self.assertEqual(Subscription.objects.filter(student=self.student).count(), 2)
        self.assertEqual(Charge.objects.filter(student=self.student).count(), 2)

    def test_renewal_can_record_matching_payment(self):
        original = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "idempotency_key": "subscription-paid-renew-original",
            }), content_type="application/json").json()
        response = self.client.post(
            f"/api/admin/subscriptions/{original['subscription']['id']}/renew/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "payment_received": True,
                "payment_method": "card",
                "payment_date": "2026-09-26",
                "idempotency_key": "subscription-paid-renewal-001",
            }), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["payment"]["amount_minor"], 28000)
        self.assertEqual(response.json()["payment"]["method"], "card")

    def test_renewal_uses_custom_sale_price(self):
        original = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "idempotency_key": "custom-renew-original"}),
            content_type="application/json").json()
        response = self.client.post(
            f"/api/admin/subscriptions/{original['subscription']['id']}/renew/",
            data=json.dumps({"subscription_type_id": self.subscription_type.id,
                             "start_date": (timezone.localdate() + timedelta(days=7)).isoformat(),
                             "price_minor": 15000, "payment_received": True,
                             "payment_method": "card", "payment_date": "2026-10-20",
                             "idempotency_key": "custom-renew"}),
            content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["charge"]["amount_minor"], 15000)
        self.assertEqual(response.json()["charge"]["due_date"], timezone.localdate().isoformat())
        self.assertEqual(response.json()["payment"]["amount_minor"], 15000)

    def test_database_rejects_a_second_charge_for_one_subscription(self):
        purchased = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "start_date": "2026-08-26",
                "idempotency_key": "subscription-db-constraint-001",
            }),
            content_type="application/json",
        ).json()
        subscription = Subscription.objects.get(
            pk=purchased["subscription"]["id"])

        with self.assertRaises(IntegrityError), transaction.atomic():
            Charge.objects.create(
                student=self.student,
                subscription=subscription,
                description="Duplicate",
                amount_minor=28000,
                currency="PLN",
                due_date=date(2026, 8, 26),
                created_by=self.admin,
            )

    def test_purchase_requires_an_idempotency_key(self):
        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "start_date": "2026-08-26",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["idempotency_key"][0]["code"],
            "required",
        )

    def test_purchase_rejects_a_whitespace_only_idempotency_key(self):
        response = self.client.post(
            f"/api/admin/participants/{self.student.id}/subscriptions/",
            data=json.dumps({
                "subscription_type_id": self.subscription_type.id,
                "start_date": "2026-08-26",
                "idempotency_key": "   ",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["idempotency_key"][0]["code"],
            "required",
        )
        self.assertFalse(Subscription.objects.filter(student=self.student).exists())
