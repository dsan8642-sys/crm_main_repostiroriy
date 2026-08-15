from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from scheduling.services import create_session

from . import factories as f


class Wave3AdminCardContractTest(TestCase):
    def setUp(self):
        self.client.force_login(f.make_admin("wave3_admin"))

    def test_group_card_contract_has_active_count_and_nearest_valid_session(self):
        trainer = f.make_trainer("wave3_group_trainer")
        group = f.make_group("Wave Three Group")
        group.default_trainer = trainer
        group.save(update_fields=["default_trainer"])
        f.make_student(group=group, first="Active", last="Participant")
        inactive = f.make_student(group=group, first="Inactive", last="Participant")
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])

        cancelled = create_session(
            trainer=trainer,
            group=group,
            start_at=timezone.now() + timedelta(days=1),
            end_at=timezone.now() + timedelta(days=1, hours=1),
            location="Cancelled Pool",
            max_participants=10,
        )
        cancelled.is_cancelled = True
        cancelled.save(update_fields=["is_cancelled"])
        nearest = create_session(
            trainer=trainer,
            group=group,
            start_at=timezone.now() + timedelta(days=2),
            end_at=timezone.now() + timedelta(days=2, hours=1),
            location="Wave Pool",
            max_participants=10,
        )

        response = self.client.get(
            "/api/admin/groups/",
            {"page": 1, "page_size": 20, "search": "Wave Three"},
        )

        self.assertEqual(response.status_code, 200)
        row = response.json()["groups"][0]
        self.assertEqual(row["participants_count"], 1)
        self.assertEqual(row["next_session"]["location"], "Wave Pool")
        self.assertEqual(
            row["next_session"]["start_at"],
            timezone.localtime(nearest.start_at).isoformat(),
        )

    def test_trainer_card_contract_counts_only_active_groups(self):
        trainer = f.make_trainer("wave3_trainer")
        active_group = f.make_group("Wave Three Active")
        active_group.default_trainer = trainer
        active_group.save(update_fields=["default_trainer"])
        inactive_group = f.make_group("Wave Three Inactive")
        inactive_group.default_trainer = trainer
        inactive_group.is_active = False
        inactive_group.save(update_fields=["default_trainer", "is_active"])

        response = self.client.get(
            "/api/admin/trainers/",
            {"page": 1, "page_size": 20, "search": "wave3_trainer"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["trainers"][0]["groups_count"], 1)

    def test_trainer_deactivation_preserves_profile_and_closes_access(self):
        trainer = f.make_trainer("wave3_deactivate")

        response = self.client.delete(f"/api/admin/trainers/{trainer.id}/")

        self.assertEqual(response.status_code, 200)
        trainer.refresh_from_db()
        trainer.user.refresh_from_db()
        self.assertFalse(trainer.is_active)
        self.assertFalse(trainer.user.is_active)
        self.assertFalse(response.json()["is_active"])
