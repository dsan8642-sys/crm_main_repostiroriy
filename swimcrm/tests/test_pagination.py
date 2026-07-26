from django.test import TestCase

from catalog.models import Group

from . import factories as f


class AdminPaginationTest(TestCase):
    def setUp(self):
        self.client.force_login(f.make_admin("pagination_admin"))
        Group.objects.bulk_create([Group(name=f"Group {index:03d}") for index in range(55)])

    def test_defaults_to_fifty_and_exposes_metadata(self):
        response = self.client.get("/api/admin/groups/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["groups"]), 50)
        self.assertEqual(payload["pagination"]["total"], 55)
        self.assertEqual(payload["pagination"]["pages"], 2)
        self.assertTrue(payload["pagination"]["has_next"])

    def test_second_page_and_custom_page_size(self):
        response = self.client.get("/api/admin/groups/", {"page": 2, "page_size": 50})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["groups"]), 5)
        self.assertTrue(response.json()["pagination"]["has_previous"])

    def test_rejects_page_size_over_two_hundred(self):
        response = self.client.get("/api/admin/groups/", {"page_size": 201})
        self.assertEqual(response.status_code, 400)
        self.assertIn("page_size", str(response.json()["error"]))
