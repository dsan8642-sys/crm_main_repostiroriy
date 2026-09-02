from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from subscriptions.models import SubscriptionStatus
from subscriptions.services import create_subscription, manual_adjust

from . import factories as f


class AdminSubscriptionListApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("subscription_list_admin")
        self.parent = f.make_parent("subscription_list_parent", "+48123456789")
        self.parent.email = "family@example.test"
        self.parent.save(update_fields=["email"])
        self.group = f.make_group("Masters Search Group")
        self.student = f.make_student(
            parent=self.parent, group=self.group, first="Anna", last="Kowalska")
        self.kind = f.make_sub_type("Eight sessions", sessions=8, days=30)
        self.client.force_login(self.admin)

    def make_subscription(self, *, start_offset, status=SubscriptionStatus.ACTIVE):
        subscription = create_subscription(
            student=self.student,
            subscription_type=self.kind,
            start_date=timezone.localdate() + timedelta(days=start_offset),
            created_by=self.admin,
        )
        if status != SubscriptionStatus.ACTIVE:
            subscription.status = status
            subscription.save(update_fields=["status"])
        return subscription

    def test_list_returns_category_counts_and_participant_contract(self):
        active = self.make_subscription(start_offset=-10)
        ending = self.make_subscription(start_offset=-24)
        depleted = self.make_subscription(start_offset=-5)
        manual_adjust(
            subscription=depleted, delta=-8, note="depleted", created_by=self.admin)
        expired = self.make_subscription(start_offset=-50)
        future = self.make_subscription(start_offset=2)
        cancelled = self.make_subscription(
            start_offset=-5, status=SubscriptionStatus.CANCELLED)

        response = self.client.get("/api/admin/subscriptions/", {
            "category": "active",
            "search": "Masters Search",
            "page": 1,
            "page_size": 50,
        })

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["counts"], {
            "active": 3,
            "ending_soon": 1,
            "depleted": 1,
            "expired_remaining": 1,
            "future": 1,
            "history": 2,
        })
        self.assertEqual(
            [row["id"] for row in payload["subscriptions"]],
            [ending.id, active.id, depleted.id],
        )
        row = payload["subscriptions"][0]
        self.assertEqual(row["participant_name"], "Kowalska Anna")
        self.assertEqual(row["phone"], "+48123456789")
        self.assertEqual(row["groups"], [{"id": self.group.id, "name": self.group.name}])
        self.assertEqual(row["remaining_sessions"], 8)
        self.assertEqual(row["allowed_actions"], ["open_client", "renew", "freeze", "adjust"])
        self.assertIn("effective_end_date", row)
        self.assertEqual(payload["pagination"]["total"], 3)
        self.assertNotIn(future.id, [row["id"] for row in payload["subscriptions"]])
        self.assertNotIn(cancelled.id, [row["id"] for row in payload["subscriptions"]])
        self.assertNotIn(expired.id, [row["id"] for row in payload["subscriptions"]])

    def test_cancelled_subscription_is_history_only_and_read_only(self):
        cancelled = self.make_subscription(
            start_offset=-5, status=SubscriptionStatus.CANCELLED)

        history = self.client.get("/api/admin/subscriptions/", {
            "category": "history", "page": 1, "page_size": 50})
        active = self.client.get("/api/admin/subscriptions/", {
            "category": "active", "page": 1, "page_size": 50})

        history_row = next(
            row for row in history.json()["subscriptions"] if row["id"] == cancelled.id)
        self.assertEqual(history_row["allowed_actions"], ["open_client"])
        self.assertNotIn(
            cancelled.id, [row["id"] for row in active.json()["subscriptions"]])

    def test_non_admin_cannot_list_subscriptions(self):
        self.client.force_login(self.parent.user)
        response = self.client.get("/api/admin/subscriptions/")
        self.assertEqual(response.status_code, 403)

    def test_filters_date_range_and_pagination_are_server_side(self):
        first = self.make_subscription(start_offset=-20)
        self.make_subscription(start_offset=-5)

        response = self.client.get("/api/admin/subscriptions/", {
            "category": "active",
            "subscription_type_id": self.kind.id,
            "group_id": self.group.id,
            "end_from": first.effective_end_date.isoformat(),
            "end_to": first.effective_end_date.isoformat(),
            "page": 1,
            "page_size": 1,
        })

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual([row["id"] for row in payload["subscriptions"]], [first.id])
        self.assertEqual(payload["pagination"]["page_size"], 1)
        self.assertEqual(payload["pagination"]["total"], 1)

    def test_list_query_count_does_not_grow_with_result_count(self):
        self.make_subscription(start_offset=-10)
        with CaptureQueriesContext(connection) as baseline_queries:
            baseline = self.client.get("/api/admin/subscriptions/", {
                "category": "active", "page_size": 50})
        self.assertEqual(baseline.status_code, 200)

        for index in range(8):
            parent = f.make_parent(
                f"subscription_query_parent_{index}", f"+4899000{index:04d}")
            student = f.make_student(
                parent=parent,
                group=self.group,
                first=f"Query {index}",
                last="Participant",
            )
            create_subscription(
                student=student,
                subscription_type=self.kind,
                start_date=timezone.localdate() - timedelta(days=10),
                created_by=self.admin,
            )

        with CaptureQueriesContext(connection) as populated_queries:
            populated = self.client.get("/api/admin/subscriptions/", {
                "category": "active", "page_size": 50})
        self.assertEqual(populated.status_code, 200)
        self.assertEqual(len(populated.json()["subscriptions"]), 9)
        self.assertLessEqual(len(populated_queries), len(baseline_queries) + 1)
