import json

from django.test import TestCase

from attendance.models import AttendanceStatus
from billing.models import Charge

from . import factories as f


class GroupSessionPriceApiInvariantTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="group_price_invariant_admin")
        self.trainer = f.make_trainer(username="group_price_invariant_coach")
        self.old_group = f.make_group("Старая цена")
        self.old_group.price_minor = 6500
        self.old_group.currency = "PLN"
        self.old_group.save(update_fields=["price_minor", "currency"])
        self.new_group = f.make_group("Груднички")
        self.new_group.price_minor = 7000
        self.new_group.currency = "PLN"
        self.new_group.save(update_fields=["price_minor", "currency"])
        self.student = f.make_student(
            group=self.new_group,
            first="Price",
            last="Snapshot",
        )
        self.client.force_login(self.admin)

    def test_group_switch_replaces_stale_client_price_and_attendance_charges_7000(self):
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "session_type": "group",
                "group_id": self.old_group.id,
                "trainer_id": self.trainer.id,
                "start_at": "2030-08-26T17:00:00+02:00",
                "duration_minutes": 45,
                "location": "Ciao Factory",
                "max_participants": 25,
                "price_minor": 1234,
                "currency": "EUR",
            }),
            content_type="application/json",
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["price_minor"], 6500)
        self.assertEqual(created.json()["currency"], "PLN")

        moved = self.client.patch(
            f"/api/admin/schedule/sessions/{created.json()['id']}/",
            data=json.dumps({
                "group_id": self.new_group.id,
                "price_minor": 6500,
                "currency": "PLN",
            }),
            content_type="application/json",
        )

        self.assertEqual(moved.status_code, 200)
        self.assertEqual(moved.json()["price_minor"], 7000)
        self.assertEqual(moved.json()["currency"], "PLN")

        attendance = self.client.post(
            f"/api/admin/schedule/sessions/{created.json()['id']}/attendance/",
            data=json.dumps({
                "student_id": self.student.id,
                "status": AttendanceStatus.PRESENT,
            }),
            content_type="application/json",
        )

        self.assertEqual(attendance.status_code, 200)
        charge = Charge.objects.get(attendance__session_id=created.json()["id"])
        self.assertEqual(charge.amount_minor, 7000)
        self.assertEqual(charge.currency, "PLN")

    def test_future_group_edit_refreshes_a_stale_snapshot_from_the_same_group(self):
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.old_group.id,
                "trainer_id": self.trainer.id,
                "start_at": "2030-08-28T17:00:00+02:00",
                "duration_minutes": 45,
                "location": "Ciao Factory",
                "max_participants": 25,
            }),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["price_minor"], 6500)

        self.old_group.price_minor = 7000
        self.old_group.save(update_fields=["price_minor"])
        edited = self.client.patch(
            f"/api/admin/schedule/sessions/{created.json()['id']}/",
            data=json.dumps({
                "group_id": self.old_group.id,
                "price_minor": 6500,
                "notes": "refresh catalogue tariff",
            }),
            content_type="application/json",
        )

        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["price_minor"], 7000)
        self.assertEqual(edited.json()["notes"], "refresh catalogue tariff")

    def test_group_switch_is_blocked_after_any_attendance_even_without_charge(self):
        old_group_student = f.make_student(
            group=self.old_group,
            first="Historical",
            last="Roster",
        )
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.old_group.id,
                "trainer_id": self.trainer.id,
                "start_at": "2030-08-27T17:00:00+02:00",
                "duration_minutes": 45,
                "location": "Ciao Factory",
                "max_participants": 25,
            }),
            content_type="application/json",
        )
        attendance = self.client.post(
            f"/api/admin/schedule/sessions/{created.json()['id']}/attendance/",
            data=json.dumps({
                "student_id": old_group_student.id,
                "status": AttendanceStatus.EXCUSED,
            }),
            content_type="application/json",
        )

        moved = self.client.patch(
            f"/api/admin/schedule/sessions/{created.json()['id']}/",
            data=json.dumps({"group_id": self.new_group.id}),
            content_type="application/json",
        )

        self.assertEqual(attendance.status_code, 200)
        self.assertEqual(moved.status_code, 400)
        detail = self.client.get(
            f"/api/admin/schedule/sessions/{created.json()['id']}/")
        self.assertEqual(detail.json()["group"]["id"], self.old_group.id)
        self.assertEqual(detail.json()["price_minor"], 6500)

    def test_group_switch_is_blocked_for_past_session_without_attendance(self):
        created = self.client.post(
            "/api/admin/schedule/sessions/",
            data=json.dumps({
                "group_id": self.old_group.id,
                "trainer_id": self.trainer.id,
                "start_at": "2020-08-27T17:00:00+02:00",
                "duration_minutes": 45,
                "location": "Ciao Factory",
                "max_participants": 25,
            }),
            content_type="application/json",
        )

        moved = self.client.patch(
            f"/api/admin/schedule/sessions/{created.json()['id']}/",
            data=json.dumps({"group_id": self.new_group.id}),
            content_type="application/json",
        )

        self.assertEqual(moved.status_code, 400)
        detail = self.client.get(
            f"/api/admin/schedule/sessions/{created.json()['id']}/")
        self.assertEqual(detail.json()["group"]["id"], self.old_group.id)
        self.assertEqual(detail.json()["price_minor"], 6500)
