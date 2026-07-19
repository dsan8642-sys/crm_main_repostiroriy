import json
import tempfile
from datetime import date, timedelta
from pathlib import Path

from django.test import TestCase, override_settings
from django.utils import timezone

from audit.models import AuditLogEntry
from billing.models import Charge, Payment, PaymentStatus, ReceiptFile
from billing.services import confirm_payment
from localization.models import DictionaryKey, DictionaryTranslation, Language
from notifications.models import (
    Channel, EventType, NotificationRule, NotificationTemplate,
    NotificationTemplateTranslation, QuietHoursPolicy,
)
from payroll.models import PayrollRule, PayrollScheme, TrainerPayrollAssignment
from payroll.services import calculate_payroll_period
from common.nocobase_blueprint import validate_nocobase_build_pack
from portal.nocobase_contract import NOCOBASE_ENDPOINT_SCHEMAS
from scheduling.models import Location, SessionType, SessionTypeConfig
from scheduling.services import create_session
from subscriptions.services import create_subscription, manual_adjust

from . import factories as f


BRIDGE_HEADERS = {"HTTP_AUTHORIZATION": "Bearer bridge-secret"}
CONFIG_HEADERS = {"HTTP_AUTHORIZATION": "Bearer config-secret"}


@override_settings(NOCOBASE_BRIDGE_TOKEN="bridge-secret", NOCOBASE_CONFIG_TOKEN="config-secret",
                   SUBSCRIPTION_GRACE_DAYS=7)
class NocoBaseBridgeApiRule(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="bridge_admin")
        self.group = f.make_group("Bridge group")
        self.student = f.make_student(
            group=self.group,
            first="Ada",
            last="Bridge",
            email="ada@example.test",
        )
        self.student.medical_info = "Sensitive medical note"
        self.student.admin_comments = "Internal admin note"
        self.student.save(update_fields=["medical_info", "admin_comments"])

    def _assert_schema_keys(self, method, path, payload):
        schema = NOCOBASE_ENDPOINT_SCHEMAS[(method, path)]
        if "top_level_keys" in schema:
            self.assertEqual(set(payload.keys()), set(schema["top_level_keys"]))

        collection_key = schema.get("collection_key")
        if collection_key:
            for item in payload[collection_key]:
                self.assertEqual(set(item.keys()), set(schema["item_keys"]))
                for key, expected_keys in schema.get("nested_keys", {}).items():
                    if item.get(key) is not None:
                        self._assert_nested_keys(item[key], expected_keys)
                self._assert_forbidden_keys_absent(item, schema.get("forbidden_keys", []))
            return

        if "object_keys" in schema:
            self.assertEqual(set(payload.keys()), set(schema["object_keys"]))
            for key, expected_keys in schema.get("nested_keys", {}).items():
                if payload.get(key) is not None:
                    self._assert_nested_keys(payload[key], expected_keys)
        self._assert_forbidden_keys_absent(payload, schema.get("forbidden_keys", []))

    def _assert_nested_keys(self, value, expected_keys):
        if isinstance(value, list):
            for row in value:
                self.assertEqual(set(row.keys()), set(expected_keys))
        else:
            self.assertEqual(set(value.keys()), set(expected_keys))

    def _assert_forbidden_keys_absent(self, value, forbidden_keys):
        if isinstance(value, dict):
            for key, child in value.items():
                self.assertNotIn(key, forbidden_keys)
                self._assert_forbidden_keys_absent(child, forbidden_keys)
        elif isinstance(value, list):
            for child in value:
                self._assert_forbidden_keys_absent(child, forbidden_keys)

    def test_bridge_requires_token(self):
        missing = self.client.get("/api/nocobase/health/")
        wrong = self.client.get("/api/nocobase/health/", HTTP_AUTHORIZATION="Bearer wrong")

        self.assertEqual(missing.status_code, 403)
        self.assertEqual(wrong.status_code, 403)

    def test_bridge_health_accepts_bearer_token(self):
        response = self.client.get("/api/nocobase/health/", **BRIDGE_HEADERS)

        self.assertEqual(response.status_code, 200)
        self._assert_schema_keys("GET", "/api/nocobase/health/", response.json())
        self.assertEqual(response.json()["mode"], "read-only")
        self.assertTrue(response.json()["config_api"])

    def test_build_pack_list_data_sources_match_live_response_schemas(self):
        build_pack_path = Path(__file__).resolve().parents[2] / "docs" / "NOCOBASE_SCREEN_BUILD_PACK.json"
        build_pack = json.loads(build_pack_path.read_text(encoding="utf-8"))
        seen = set()

        for screen in build_pack["screens"]:
            for source in screen["data_sources"]:
                if source["method"] != "GET" or "<id>" in source["path"]:
                    continue
                key = (source["method"], source["path"])
                if key in seen:
                    continue
                seen.add(key)

                headers = BRIDGE_HEADERS if source["token"] == "NOCOBASE_BRIDGE_TOKEN" else CONFIG_HEADERS
                response = self.client.get(source["path"], **headers)

                self.assertEqual(response.status_code, 200, f"{key} failed: {response.content}")
                self._assert_schema_keys(source["method"], source["path"], response.json())

        self.assertGreaterEqual(len(seen), 10)

    def test_build_pack_validator_rejects_query_metadata_drift(self):
        repo_root = Path(__file__).resolve().parents[2]
        build_pack_path = repo_root / "docs" / "NOCOBASE_SCREEN_BUILD_PACK.json"
        blueprint_path = repo_root / "docs" / "NOCOBASE_FIRST_SCREENS.json"
        build_pack = json.loads(build_pack_path.read_text(encoding="utf-8"))
        for screen in build_pack["screens"]:
            if screen["screen_id"] != "client_directory":
                continue
            for source in screen["data_sources"]:
                if source["name"] == "clients":
                    source.pop("query", None)

        with tempfile.TemporaryDirectory() as temp_dir:
            drifted_path = Path(temp_dir) / "drifted-build-pack.json"
            drifted_path.write_text(json.dumps(build_pack), encoding="utf-8")
            result = validate_nocobase_build_pack(drifted_path, blueprint_path=blueprint_path)

        self.assertFalse(result["ok"])
        self.assertTrue(result["errors"]["query_mismatches"])
        self.assertEqual(result["errors"]["query_mismatches"][0]["path"], "/api/nocobase/clients/")

    def test_clients_endpoint_uses_domain_state_without_sensitive_fields(self):
        subscription = create_subscription(
            student=self.student,
            subscription_type=f.make_sub_type(name="Bridge pack", sessions=8, days=30),
            start_date=date.today(),
            created_by=self.admin,
        )
        manual_adjust(subscription=subscription, delta=-2, created_by=self.admin, note="bridge test")
        Charge.objects.create(
            student=self.student,
            subscription=subscription,
            description="Bridge charge",
            amount_minor=24000,
            currency="PLN",
            due_date=date.today() - timedelta(days=1),
            created_by=self.admin,
        )
        payment = Payment.objects.create(
            student=self.student,
            amount_minor=10000,
            currency="PLN",
            paid_at=date.today(),
            method="bank_transfer",
            status=PaymentStatus.PENDING,
            comment="Sensitive payment comment",
            created_by=self.admin,
        )
        confirm_payment(payment, self.admin)
        ReceiptFile.objects.create(payment=payment, original_name="receipt.pdf", uploaded_at=timezone.now())

        response = self.client.get("/api/nocobase/clients/", {"q": "Bridge"}, **BRIDGE_HEADERS)

        self.assertEqual(response.status_code, 200)
        self._assert_schema_keys("GET", "/api/nocobase/clients/", response.json())
        row = response.json()["clients"][0]
        self.assertEqual(row["full_name"], "Bridge Ada")
        self.assertEqual(row["parent"]["phone"], self.student.parent.phone)
        self.assertEqual(row["balance_minor"], 14000)
        self.assertTrue(row["has_overdue_charge"])
        self.assertEqual(row["latest_payment"]["method"], "bank_transfer")
        self.assertEqual(row["latest_payment"]["status"], PaymentStatus.CONFIRMED)
        self.assertEqual(row["active_subscription"]["remaining_sessions"], 6)
        self.assertEqual(
            row["active_subscription"]["grace_end_date"],
            subscription.grace_end_date.isoformat(),
        )
        serialized = str(row)
        self.assertNotIn("Sensitive medical note", serialized)
        self.assertNotIn("Internal admin note", serialized)
        self.assertNotIn("Sensitive payment comment", serialized)
        self.assertNotIn("receipt.pdf", serialized)

    def test_clients_endpoint_validates_limit_query(self):
        invalid = self.client.get("/api/nocobase/clients/", {"limit": "abc"}, **BRIDGE_HEADERS)
        zero = self.client.get("/api/nocobase/clients/", {"limit": "0"}, **BRIDGE_HEADERS)
        capped = self.client.get("/api/nocobase/clients/", {"limit": "9999"}, **BRIDGE_HEADERS)

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(zero.status_code, 400)
        self.assertIn("limit must be an integer", invalid.json()["error"])
        self.assertIn("limit must be at least 1", zero.json()["error"])
        self.assertEqual(capped.status_code, 200)
        self._assert_schema_keys("GET", "/api/nocobase/clients/", capped.json())

    def test_config_list_endpoints_validate_integer_filters(self):
        cases = [
            ("/api/nocobase/config/notification-template-translations/", "template_id"),
            ("/api/nocobase/config/payroll/rules/", "scheme_id"),
            ("/api/nocobase/config/payroll/assignments/", "trainer_id"),
        ]

        for path, query_name in cases:
            with self.subTest(path=path, query_name=query_name):
                response = self.client.get(path, {query_name: "abc"}, **CONFIG_HEADERS)

                self.assertEqual(response.status_code, 400)
                self.assertIn(f"{query_name} must be an integer", response.json()["error"])

    def test_debtors_endpoint_exposes_operational_summary_only(self):
        Charge.objects.create(
            student=self.student,
            description="Overdue",
            amount_minor=5000,
            currency="PLN",
            due_date=date.today() - timedelta(days=1),
            created_by=self.admin,
        )

        response = self.client.get("/api/nocobase/debtors/", **BRIDGE_HEADERS)

        self.assertEqual(response.status_code, 200)
        self._assert_schema_keys("GET", "/api/nocobase/debtors/", response.json())
        rows = response.json()["debtors"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["participant_id"], self.student.id)
        self.assertEqual(rows[0]["balance_minor"], 5000)
        self.assertIn("parent_phone", rows[0])

    def test_payroll_periods_bridge_is_read_only_reporting(self):
        trainer = f.make_trainer(username="bridge_payroll_trainer")
        scheme = PayrollScheme.objects.create(name="Bridge payroll")
        TrainerPayrollAssignment.objects.create(
            trainer=trainer,
            scheme=scheme,
            effective_from=date(2026, 7, 1),
        )
        PayrollRule.objects.create(
            scheme=scheme,
            session_type=SessionType.GROUP,
            rule_type=SessionType.GROUP,
            base_amount_minor=10000,
            min_clients_threshold=1,
            extra_client_amount_minor=2000,
        )
        session = create_session(
            trainer=trainer,
            start_at=f.dt(2026, 7, 15, 17),
            end_at=f.dt(2026, 7, 15, 18),
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
            actor=self.admin,
        )
        from attendance.models import AttendanceStatus
        from attendance.services import set_attendance
        set_attendance(
            session_id=session.id,
            student=self.student,
            status=AttendanceStatus.PRESENT,
            actor=self.admin,
        )
        summary = calculate_payroll_period(
            date_from=date(2026, 7, 1),
            date_to=date(2026, 7, 31),
            location="Pool A",
            actor=self.admin,
        )

        listing = self.client.get("/api/nocobase/payroll/periods/", **BRIDGE_HEADERS)
        detail = self.client.get(f"/api/nocobase/payroll/periods/{summary.period.id}/", **BRIDGE_HEADERS)
        write_attempt = self.client.post(
            "/api/nocobase/payroll/periods/",
            data=json.dumps({"date_from": "2026-07-01", "date_to": "2026-07-31"}),
            content_type="application/json",
            **BRIDGE_HEADERS,
        )

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(write_attempt.status_code, 405)
        self._assert_schema_keys("GET", "/api/nocobase/payroll/periods/", listing.json())
        self._assert_schema_keys("GET", "/api/nocobase/payroll/periods/<id>/", detail.json())
        self.assertEqual(listing.json()["periods"][0]["calculations_count"], 1)
        self.assertEqual(detail.json()["calculations"][0]["final_amount_minor"], 10000)
        serialized = str(detail.json())
        self.assertNotIn("approve", serialized)
        self.assertNotIn("payouts", serialized)

    def test_config_endpoints_require_separate_config_token(self):
        read_only_attempt = self.client.post(
            "/api/nocobase/config/quiet-hours/",
            data=json.dumps({"channel": "email", "starts_at": "22:00", "ends_at": "08:00"}),
            content_type="application/json",
            **BRIDGE_HEADERS,
        )
        missing = self.client.get("/api/nocobase/config/payroll/schemes/")

        self.assertEqual(read_only_attempt.status_code, 403)
        self.assertEqual(missing.status_code, 403)

    def test_config_health_endpoint_requires_config_token(self):
        Language.objects.create(code="pl", name="Polski")

        bridge_attempt = self.client.get("/api/nocobase/config/languages/", **BRIDGE_HEADERS)
        ok = self.client.get("/api/nocobase/config/languages/", **CONFIG_HEADERS)

        self.assertEqual(bridge_attempt.status_code, 403)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["languages"][0]["code"], "pl")

    def test_config_token_can_manage_quiet_hours_and_payroll_config(self):
        quiet = self.client.post(
            "/api/nocobase/config/quiet-hours/",
            data=json.dumps({
                "channel": "email",
                "starts_at": "22:00",
                "ends_at": "08:00",
                "timezone": "Europe/Warsaw",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        scheme = self.client.post(
            "/api/nocobase/config/payroll/schemes/",
            data=json.dumps({"name": "NocoBase payroll", "location": "Pool A"}),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        scheme_id = scheme.json()["id"]
        rule = self.client.post(
            "/api/nocobase/config/payroll/rules/",
            data=json.dumps({
                "scheme_id": scheme_id,
                "session_type": SessionType.GROUP,
                "rule_type": SessionType.GROUP,
                "base_amount_minor": 10000,
                "min_clients_threshold": 2,
                "extra_client_amount_minor": 1500,
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        trainer = f.make_trainer(username="config_trainer")
        assignment = self.client.post(
            "/api/nocobase/config/payroll/assignments/",
            data=json.dumps({
                "trainer_id": trainer.id,
                "scheme_id": scheme_id,
                "effective_from": "2026-07-01",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(quiet.status_code, 201)
        self.assertEqual(scheme.status_code, 201)
        self.assertEqual(rule.status_code, 201)
        self.assertEqual(assignment.status_code, 201)
        self._assert_schema_keys("POST", "/api/nocobase/config/quiet-hours/", quiet.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/payroll/schemes/", scheme.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/payroll/rules/", rule.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/payroll/assignments/", assignment.json())

        quiet_list = self.client.get("/api/nocobase/config/quiet-hours/", **CONFIG_HEADERS)
        scheme_list = self.client.get("/api/nocobase/config/payroll/schemes/", **CONFIG_HEADERS)
        rule_list = self.client.get("/api/nocobase/config/payroll/rules/", **CONFIG_HEADERS)
        assignment_list = self.client.get("/api/nocobase/config/payroll/assignments/", **CONFIG_HEADERS)
        self._assert_schema_keys("GET", "/api/nocobase/config/quiet-hours/", quiet_list.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/payroll/schemes/", scheme_list.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/payroll/rules/", rule_list.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/payroll/assignments/", assignment_list.json())
        self.assertEqual(QuietHoursPolicy.objects.count(), 1)
        self.assertEqual(PayrollScheme.objects.get().name, "NocoBase payroll")
        self.assertEqual(PayrollRule.objects.get().extra_client_amount_minor, 1500)
        self.assertEqual(TrainerPayrollAssignment.objects.get().trainer, trainer)
        actions = set(AuditLogEntry.objects.values_list("action", flat=True))
        self.assertIn("nocobase_config.QuietHoursPolicy.created", actions)
        self.assertIn("nocobase_config.PayrollScheme.created", actions)
        self.assertIn("nocobase_config.PayrollRule.created", actions)
        self.assertIn("nocobase_config.TrainerPayrollAssignment.created", actions)
        self.assertTrue(AuditLogEntry.objects.filter(
            action="nocobase_config.PayrollRule.created",
            actor__isnull=True,
            changes__source="nocobase_config_api",
        ).exists())

    def test_config_token_can_manage_notification_templates_and_rules(self):
        template = self.client.post(
            "/api/nocobase/config/notification-templates/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": Channel.EMAIL,
                "subject": "Payment reminder",
                "body": "Please pay {amount}",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        self.assertEqual(template.status_code, 201)
        self._assert_schema_keys("POST", "/api/nocobase/config/notification-templates/", template.json())

        rule = self.client.post(
            "/api/nocobase/config/notification-rules/",
            data=json.dumps({
                "event_type": EventType.PAYMENT_REMINDER,
                "channel": Channel.EMAIL,
                "template_id": template.json()["id"],
                "offset_minutes": -1440,
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        self.assertEqual(rule.status_code, 201)
        self._assert_schema_keys("POST", "/api/nocobase/config/notification-rules/", rule.json())

        template_list = self.client.get("/api/nocobase/config/notification-templates/", **CONFIG_HEADERS)
        rule_list = self.client.get("/api/nocobase/config/notification-rules/", {"active": "true"}, **CONFIG_HEADERS)
        template_detail = self.client.get(
            f"/api/nocobase/config/notification-templates/{template.json()['id']}/",
            **CONFIG_HEADERS,
        )
        rule_detail = self.client.get(
            f"/api/nocobase/config/notification-rules/{rule.json()['id']}/",
            **CONFIG_HEADERS,
        )
        protected_delete = self.client.delete(
            f"/api/nocobase/config/notification-templates/{template.json()['id']}/",
            **CONFIG_HEADERS,
        )

        self._assert_schema_keys("GET", "/api/nocobase/config/notification-templates/", template_list.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/notification-rules/", rule_list.json())
        self._assert_schema_keys(
            "GET",
            "/api/nocobase/config/notification-templates/<id>/",
            template_detail.json(),
        )
        self._assert_schema_keys("GET", "/api/nocobase/config/notification-rules/<id>/", rule_detail.json())
        self.assertEqual(NotificationTemplate.objects.count(), 1)
        self.assertEqual(NotificationRule.objects.count(), 1)
        self.assertEqual(protected_delete.status_code, 400)
        self.assertIn("notification template is used", protected_delete.json()["error"][0])
        actions = set(AuditLogEntry.objects.values_list("action", flat=True))
        self.assertIn("nocobase_config.NotificationTemplate.created", actions)
        self.assertIn("nocobase_config.NotificationRule.created", actions)
        self.assertNotIn("nocobase_config.NotificationTemplate.deleted", actions)

    def test_config_notification_rule_validation_stays_in_django(self):
        template = NotificationTemplate.objects.create(
            event_type=EventType.PAYMENT_REMINDER,
            channel=Channel.EMAIL,
            subject="Payment",
            body="Pay",
        )
        invalid = self.client.post(
            "/api/nocobase/config/notification-rules/",
            data=json.dumps({
                "event_type": EventType.SESSION_REMINDER,
                "channel": Channel.EMAIL,
                "template_id": template.id,
                "offset_minutes": 60,
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(NotificationRule.objects.count(), 0)

    def test_config_token_can_manage_locations_and_session_types(self):
        location = self.client.post(
            "/api/nocobase/config/locations/",
            data=json.dumps({
                "code": "pool-a",
                "name": "Pool A",
                "address": "Main aquapark",
                "timezone": "Europe/Warsaw",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        session_type = self.client.post(
            "/api/nocobase/config/session-types/",
            data=json.dumps({
                "code": SessionType.SPLIT,
                "label": "Split lesson",
                "default_capacity": 2,
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(location.status_code, 201)
        self.assertEqual(session_type.status_code, 201)
        self._assert_schema_keys("POST", "/api/nocobase/config/locations/", location.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/session-types/", session_type.json())

        locations = self.client.get("/api/nocobase/config/locations/", {"active": "true"}, **CONFIG_HEADERS)
        session_types = self.client.get("/api/nocobase/config/session-types/", **CONFIG_HEADERS)
        location_detail = self.client.get(
            f"/api/nocobase/config/locations/{location.json()['id']}/",
            **CONFIG_HEADERS,
        )
        session_type_detail = self.client.get(
            f"/api/nocobase/config/session-types/{session_type.json()['id']}/",
            **CONFIG_HEADERS,
        )

        self._assert_schema_keys("GET", "/api/nocobase/config/locations/", locations.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/session-types/", session_types.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/locations/<id>/", location_detail.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/session-types/<id>/", session_type_detail.json())
        self.assertEqual(Location.objects.get().code, "pool-a")
        self.assertEqual(SessionTypeConfig.objects.get().default_capacity, 2)

    def test_config_session_type_validation_stays_in_django(self):
        invalid = self.client.post(
            "/api/nocobase/config/session-types/",
            data=json.dumps({
                "code": "unsupported",
                "label": "Unsupported",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(SessionTypeConfig.objects.count(), 0)

    def test_config_token_can_manage_localization_config(self):
        language = self.client.post(
            "/api/nocobase/config/languages/",
            data=json.dumps({"code": "PL", "name": "Polski"}),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        key = self.client.post(
            "/api/nocobase/config/dictionary-keys/",
            data=json.dumps({"domain": "ui", "code": "dashboard.title"}),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        translation = self.client.post(
            "/api/nocobase/config/dictionary-translations/",
            data=json.dumps({
                "key_id": key.json()["id"],
                "language_code": "pl",
                "value": "Panel",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )
        template = NotificationTemplate.objects.create(
            event_type="payment_reminder",
            channel="email",
            subject="Payment",
            body="Pay {amount}",
        )
        template_translation = self.client.post(
            "/api/nocobase/config/notification-template-translations/",
            data=json.dumps({
                "template_id": template.id,
                "language_code": "pl",
                "subject": "Platnosc",
                "body": "Zapłać {amount}",
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(language.status_code, 201)
        self._assert_schema_keys("POST", "/api/nocobase/config/languages/", language.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/dictionary-keys/", key.json())
        self._assert_schema_keys("POST", "/api/nocobase/config/dictionary-translations/", translation.json())
        self._assert_schema_keys(
            "POST",
            "/api/nocobase/config/notification-template-translations/",
            template_translation.json(),
        )
        languages = self.client.get("/api/nocobase/config/languages/", **CONFIG_HEADERS)
        keys = self.client.get("/api/nocobase/config/dictionary-keys/", **CONFIG_HEADERS)
        translations = self.client.get("/api/nocobase/config/dictionary-translations/", **CONFIG_HEADERS)
        template_translations = self.client.get(
            "/api/nocobase/config/notification-template-translations/",
            **CONFIG_HEADERS,
        )
        self._assert_schema_keys("GET", "/api/nocobase/config/languages/", languages.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/dictionary-keys/", keys.json())
        self._assert_schema_keys("GET", "/api/nocobase/config/dictionary-translations/", translations.json())
        self._assert_schema_keys(
            "GET",
            "/api/nocobase/config/notification-template-translations/",
            template_translations.json(),
        )
        self.assertEqual(language.json()["code"], "pl")
        self.assertEqual(key.status_code, 201)
        self.assertEqual(translation.status_code, 201)
        self.assertEqual(template_translation.status_code, 201)
        self.assertEqual(Language.objects.get().code, "pl")
        self.assertEqual(DictionaryKey.objects.get().code, "dashboard.title")
        self.assertEqual(DictionaryTranslation.objects.get().value, "Panel")
        self.assertEqual(NotificationTemplateTranslation.objects.get().subject, "Platnosc")
        actions = set(AuditLogEntry.objects.values_list("action", flat=True))
        self.assertIn("nocobase_config.Language.created", actions)
        self.assertIn("nocobase_config.DictionaryKey.created", actions)
        self.assertIn("nocobase_config.DictionaryTranslation.created", actions)
        self.assertIn("nocobase_config.NotificationTemplateTranslation.created", actions)

    def test_config_payroll_rule_validation_stays_in_django(self):
        scheme = PayrollScheme.objects.create(name="Validation payroll")
        invalid = self.client.post(
            "/api/nocobase/config/payroll/rules/",
            data=json.dumps({
                "scheme_id": scheme.id,
                "session_type": SessionType.GROUP,
                "rule_type": SessionType.INDIVIDUAL,
                "base_amount_minor": 10000,
            }),
            content_type="application/json",
            **CONFIG_HEADERS,
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(PayrollRule.objects.count(), 0)
