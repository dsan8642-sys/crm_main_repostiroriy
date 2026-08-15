from django.test import TestCase

from portal.openapi import build_openapi_schema


class OpenApiContractTest(TestCase):
    def test_public_schema_is_machine_readable_and_matches_routes(self):
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)
        schema = response.json()
        self.assertEqual(schema["openapi"], "3.1.0")
        self.assertIn("/api/admin/clients/", schema["paths"])
        self.assertIn("get", schema["paths"]["/api/admin/clients/"])
        self.assertIn("post", schema["paths"]["/api/admin/clients/"])
        self.assertIn("/api/client/charges/", schema["paths"])
        self.assertIn("/api/client/payment-history/", schema["paths"])
        list_parameters = {
            item["name"]
            for item in schema["paths"]["/api/client/charges/"]["get"]["parameters"]
        }
        self.assertTrue({"page", "page_size", "search", "q", "order"} <= list_parameters)
        order_parameter = next(
            item for item in schema["paths"]["/api/client/charges/"]["get"]["parameters"]
            if item["name"] == "order"
        )
        self.assertEqual(
            order_parameter["schema"]["enum"],
            ["-date", "date", "-amount", "amount"],
        )
        self.assertEqual(
            schema["paths"]["/api/client/charges/"]["get"]["x-page-size-500"],
            "blocked pending endpoint query and payload budgets",
        )
        detail = schema["paths"]["/api/admin/settings/locations/{location_id}/"]
        self.assertIn("patch", detail)
        self.assertNotIn("post", detail)

    def test_operation_ids_are_unique(self):
        schema = build_openapi_schema()
        operation_ids = [
            operation["operationId"]
            for path_item in schema["paths"].values()
            for method, operation in path_item.items()
            if method in {"get", "post", "put", "patch", "delete"}
        ]
        self.assertEqual(len(operation_ids), len(set(operation_ids)))
