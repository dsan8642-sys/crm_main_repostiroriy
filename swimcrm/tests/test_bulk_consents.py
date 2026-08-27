import json

from django.test import TestCase

from accounts.models import Consent, ConsentType

from . import factories as f


class BulkConsentTest(TestCase):
    def setUp(self):
        self.parent = f.make_parent("bulk_consent_parent")
        self.client.force_login(self.parent.user)

    def test_returns_result_for_every_item_and_keeps_successes(self):
        response = self.client.post(
            "/api/client/consents/",
            data=json.dumps({
                "items": [
                    {"type": ConsentType.EMAIL, "granted": True, "policy_version": "v2"},
                    {"type": "invalid", "granted": True},
                    {"type": ConsentType.SMS, "granted": True, "policy_version": "v2"},
                ],
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 207)
        payload = response.json()
        self.assertEqual(payload["summary"], {"total": 3, "succeeded": 2, "failed": 1})
        self.assertEqual(len(payload["results"]), 3)
        self.assertTrue(Consent.objects.get(
            parent=self.parent, type=ConsentType.EMAIL).is_active)
        self.assertTrue(Consent.objects.get(
            parent=self.parent, type=ConsentType.SMS).is_active)
