import json
from datetime import date, time, timedelta

from django.test import TestCase

from scheduling.models import (
    ScheduleBatchStatus,
    ScheduleOperationBatch,
    Session,
    SessionType,
    WeeklyPlan,
    WeeklyPlanSlot,
)
from scheduling.services import create_session

from . import factories as f


class WeeklyPlanApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("weekly_plan_admin")
        self.client.force_login(self.admin)
        self.group = f.make_group("Weekly Group")
        self.trainer = f.make_trainer("weekly_plan_trainer")

    def test_plan_with_multiple_slots_generates_period(self):
        plan = WeeklyPlan.objects.create(group=self.group, name="Main")
        WeeklyPlanSlot.objects.create(
            plan=plan, trainer=self.trainer, weekday=0, start_time=time(17),
            duration_minutes=45, location="A", max_participants=10)
        WeeklyPlanSlot.objects.create(
            plan=plan, trainer=self.trainer, weekday=2, start_time=time(18),
            duration_minutes=60, location="B", max_participants=10)
        response = self.client.post(
            f"/api/admin/schedule/plans/{plan.id}/generate/",
            data=json.dumps({
                "date_from": "2026-08-03",
                "date_to": "2026-08-09",
                "skip_conflicts": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["created_count"], 2)
        self.assertEqual(
            set(Session.objects.values_list("duration_minutes", flat=True)),
            {45, 60},
        )

    def test_period_copy_uses_server_owned_batch_once(self):
        source_start = f.dt(2026, 8, 10, 17)
        source = create_session(
            trainer=self.trainer,
            start_at=source_start,
            duration_minutes=60,
            location="Pool",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
        )
        preview = self.client.post(
            "/api/admin/schedule/copy-period/preview/",
            data=json.dumps({
                "source_from": "2026-08-10",
                "source_to": "2026-08-16",
                "target_from": "2026-08-17",
                "target_to": "2026-08-23",
                "include_group": True,
                "include_individual": False,
                "include_split": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(preview.status_code, 200)
        row = preview.json()["rows"][0]
        self.assertEqual(row["source_session_id"], source.id)
        self.assertEqual(row["status"], "ready")

        commit_body = {
            "batch_id": preview.json()["batch_id"],
            "selected_indices": [row["index"]],
        }
        commit = self.client.post(
            "/api/admin/schedule/copy-period/commit/",
            data=json.dumps(commit_body),
            content_type="application/json",
        )
        self.assertEqual(commit.status_code, 201)
        self.assertEqual(commit.json()["created_count"], 1)
        batch = ScheduleOperationBatch.objects.get(pk=preview.json()["batch_id"])
        self.assertEqual(batch.status, ScheduleBatchStatus.COMMITTED)
        replay = self.client.post(
            "/api/admin/schedule/copy-period/commit/",
            data=json.dumps(commit_body),
            content_type="application/json",
        )
        self.assertEqual(replay.status_code, 400)
