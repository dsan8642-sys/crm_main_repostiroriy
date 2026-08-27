from django.test import TestCase

from accounts.models import ParentAccount, Role, User
from students.models import Student
from tests import factories as f


class AdminClientSearchScaleTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = f.make_admin("scale_search_admin")
        users = User.objects.bulk_create([
            User(
                username=f"scale_parent_{index:03d}",
                password="!",
                role=Role.PARENT,
                first_name="Account" if index == 399 else "",
                last_name="OwnerUnique" if index == 399 else "",
            )
            for index in range(400)
        ])
        parents = ParentAccount.objects.bulk_create([
            ParentAccount(
                user=user,
                phone=f"+48600{index:06d}",
                email=f"scale-parent-{index:03d}@example.test",
            )
            for index, user in enumerate(users)
        ])
        cls.students = Student.objects.bulk_create([
            Student(
                parent=parent,
                first_name=f"Client{index:03d}",
                last_name="ScaleSearch",
                email=f"scale-student-{index:03d}@example.test",
            )
            for index, parent in enumerate(parents)
        ])

    def setUp(self):
        self.client.force_login(self.admin)

    def test_reference_search_does_not_hide_matches_after_first_hundred(self):
        bootstrap_response = self.client.get("/api/admin/reference/")
        search_response = self.client.get(
            "/api/admin/reference/", {"q": "ScaleSearch"})

        expected_ids = {student.id for student in self.students}
        for response in (bootstrap_response, search_response):
            self.assertEqual(response.status_code, 200)
            rows = response.json()["participants"]
            self.assertEqual(len(rows), 400)
            self.assertEqual({row["id"] for row in rows}, expected_ids)

    def test_search_finds_participant_by_visible_account_owner_and_login(self):
        expected_id = self.students[399].id

        for endpoint in ("/api/admin/reference/", "/api/admin/clients/"):
            for query in ("OwnerUnique", "scale_parent_399"):
                response = self.client.get(endpoint, {"q": query, "search": query})

                self.assertEqual(response.status_code, 200)
                key = "participants" if endpoint.endswith("reference/") else "clients"
                self.assertEqual(
                    [row["id"] for row in response.json()[key]],
                    [expected_id],
                )

    def test_client_list_search_and_totals_cover_all_four_hundred_clients(self):
        first_page = self.client.get(
            "/api/admin/clients/",
            {"page": 1, "page_size": 100, "active": "true"},
        )
        last_page = self.client.get(
            "/api/admin/clients/",
            {"page": 4, "page_size": 100, "active": "true"},
        )
        target = self.client.get(
            "/api/admin/clients/",
            {"search": "Client399", "active": "true"},
        )
        dashboard = self.client.get("/api/admin/dashboard/")

        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(first_page.json()["pagination"]["total"], 400)
        self.assertEqual(first_page.json()["pagination"]["pages"], 4)
        self.assertEqual(len(last_page.json()["clients"]), 100)
        self.assertEqual(
            [row["id"] for row in target.json()["clients"]],
            [self.students[399].id],
        )
        self.assertEqual(
            dashboard.json()["clients"]["participants"], 400)

    def test_client_list_can_return_all_matching_clients_without_a_hidden_cap(self):
        response = self.client.get(
            "/api/admin/clients/",
            {"all": "true", "active": "true", "search": "ScaleSearch"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["clients"]), 400)
        self.assertEqual(payload["pagination"], {
            "page": 1,
            "page_size": 400,
            "total": 400,
            "pages": 1,
            "has_next": False,
            "has_previous": False,
        })
        self.assertEqual(
            [row["id"] for row in payload["clients"]],
            [student.id for student in self.students],
        )

    def test_client_list_rejects_an_invalid_all_mode(self):
        response = self.client.get("/api/admin/clients/", {"all": "sometimes"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["all"][0]["code"],
            "invalid_choice",
        )
