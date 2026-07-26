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
