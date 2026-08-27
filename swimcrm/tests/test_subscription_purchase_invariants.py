import json
from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from billing.models import Charge
from subscriptions.models import Subscription

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
