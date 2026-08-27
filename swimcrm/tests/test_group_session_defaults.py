import json

from django.test import TestCase

from scheduling.models import Location

from . import factories as f


class GroupDefaultLocationApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="group_location_admin")
        self.group = f.make_group("Location defaults group")
        self.location = Location.objects.create(
            code="group-default-pool",
            name="Group Default Pool",
        )
        self.client.force_login(self.admin)

    def test_group_without_default_location_returns_null_in_api_payloads(self):
        detail = self.client.get(f"/api/admin/groups/{self.group.id}/")
        reference = self.client.get("/api/admin/reference/")
        reference_group = next(
            row for row in reference.json()["groups"]
            if row["id"] == self.group.id
        )

        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertIsNone(detail.json()["default_location"])
        self.assertEqual(reference.status_code, 200, reference.content)
        self.assertIsNone(reference_group["default_location"])

    def test_admin_can_set_read_and_clear_active_group_default_location(self):
        updated = self.client.patch(
            f"/api/admin/groups/{self.group.id}/",
            data=json.dumps({
                "group": {"default_location_id": self.location.id},
            }),
            content_type="application/json",
        )

        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()["default_location"], {
            "id": self.location.id,
            "name": "Group Default Pool",
            "is_active": True,
        })

        detail = self.client.get(f"/api/admin/groups/{self.group.id}/")
        listing = self.client.get("/api/admin/groups/")
        listed_group = next(
            row for row in listing.json()["groups"]
            if row["id"] == self.group.id
        )

        self.assertEqual(detail.json()["default_location"], updated.json()["default_location"])
        self.assertEqual(listed_group["default_location"], updated.json()["default_location"])

        self.location.is_active = False
        self.location.save(update_fields=["is_active"])
        inactive_detail = self.client.get(f"/api/admin/groups/{self.group.id}/")
        self.assertFalse(inactive_detail.json()["default_location"]["is_active"])

        cleared = self.client.patch(
            f"/api/admin/groups/{self.group.id}/",
            data=json.dumps({"group": {"default_location_id": None}}),
            content_type="application/json",
        )

        self.assertEqual(cleared.status_code, 200, cleared.content)
        self.assertIsNone(cleared.json()["default_location"])

    def test_admin_cannot_assign_inactive_group_default_location(self):
        inactive = Location.objects.create(
            code="inactive-group-pool",
            name="Inactive Group Pool",
            is_active=False,
        )

        response = self.client.patch(
            f"/api/admin/groups/{self.group.id}/",
            data=json.dumps({
                "group": {"default_location_id": inactive.id},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["default_location_id"][0]["code"],
            "invalid_choice",
        )


class GroupSessionDefaultsApiTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="session_defaults_admin")
        self.default_trainer = f.make_trainer(username="group_default_trainer")
        self.override_trainer = f.make_trainer(username="session_override_trainer")
        self.default_location = Location.objects.create(
            code="session-default-pool",
            name="Session Default Pool",
        )
        self.group = f.make_group("Session defaults group")
        self.group.default_trainer = self.default_trainer
        self.group.default_location = self.default_location
        self.group.save(update_fields=["default_trainer", "default_location"])
        self.client.force_login(self.admin)

    def _payload(self, **overrides):
        payload = {
            "group_id": self.group.id,
            "start_at": "2026-10-01T17:00:00+02:00",
            "duration_minutes": 60,
            "max_participants": 8,
        }
        payload.update(overrides)
        return payload

    def test_group_session_uses_active_group_defaults_and_snapshots_location_name(self):
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload()),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["trainer_id"], self.default_trainer.id)
        self.assertEqual(response.json()["location"], "Session Default Pool")

        self.default_location.name = "Renamed Pool"
        self.default_location.save(update_fields=["name"])

        detail = self.client.get(
            f"/api/admin/schedule/sessions/{response.json()['id']}/"
        )
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["location"], "Session Default Pool")

    def test_explicit_trainer_and_location_override_group_defaults(self):
        response = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload(
                trainer_id=self.override_trainer.id,
                location="Override Lane",
            )),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["trainer_id"], self.override_trainer.id)
        self.assertEqual(response.json()["location"], "Override Lane")

    def test_explicit_empty_values_are_not_replaced_by_group_defaults(self):
        missing_trainer = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload(trainer_id="")),
            content_type="application/json",
        )
        missing_location = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload(location="")),
            content_type="application/json",
        )

        self.assertEqual(missing_trainer.status_code, 400)
        self.assertEqual(
            missing_trainer.json()["errors"]["trainer_id"][0]["code"],
            "required",
        )
        self.assertEqual(missing_location.status_code, 400)
        self.assertEqual(
            missing_location.json()["errors"]["location"][0]["code"],
            "required",
        )

    def test_inactive_group_defaults_require_manual_values(self):
        self.default_trainer.is_active = False
        self.default_trainer.save(update_fields=["is_active"])

        missing_trainer = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload()),
            content_type="application/json",
        )

        self.assertEqual(missing_trainer.status_code, 400)
        self.assertEqual(
            missing_trainer.json()["errors"]["trainer_id"][0]["code"],
            "required",
        )

        self.default_trainer.is_active = True
        self.default_trainer.save(update_fields=["is_active"])
        self.default_location.is_active = False
        self.default_location.save(update_fields=["is_active"])

        missing_location = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps(self._payload()),
            content_type="application/json",
        )

        self.assertEqual(missing_location.status_code, 400)
        self.assertEqual(
            missing_location.json()["errors"]["location"][0]["code"],
            "required",
        )
