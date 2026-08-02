import hashlib
import json
from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from accounts.models import AccessPurpose, AccountActivation, Role, User
from audit.models import AuditLogEntry
from scheduling.models import SessionType, SessionTypeConfig
from scheduling.services import create_session

from . import factories as f


class Prompt05SchedulePrivacyTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin("prompt05_admin")
        self.trainer = f.make_trainer("prompt05_trainer")
        self.other_trainer = f.make_trainer("prompt05_other_trainer")
        self.group = f.make_group("Prompt 05 group")
        self.student = f.make_student(
            parent=f.make_parent("prompt05_parent"),
            first="Ada",
            last="Nowak",
        )
        self.foreign_student = f.make_student(
            parent=f.make_parent("prompt05_foreign_parent"),
            first="Ewa",
            last="Kowalska",
        )
        self.start = timezone.now() + timedelta(days=8)
        self.individual = create_session(
            trainer=self.trainer,
            start_at=self.start,
            duration_minutes=60,
            location="Pool A",
            max_participants=1,
            individual_student=self.student,
            session_type=SessionType.INDIVIDUAL,
        )
        self.group_session = create_session(
            trainer=self.trainer,
            start_at=self.start + timedelta(hours=2),
            duration_minutes=60,
            location="Pool A",
            max_participants=10,
            group=self.group,
            session_type=SessionType.GROUP,
        )

    def test_individual_context_is_minimal_and_role_scoped(self):
        SessionTypeConfig.objects.update_or_create(
            code=SessionType.INDIVIDUAL,
            defaults={"label": "Персональная тренировка", "is_active": True},
        )
        date_value = timezone.localdate(self.start).isoformat()

        admin_client = Client()
        admin_client.force_login(self.admin)
        admin_rows = admin_client.get(
            "/api/admin/schedule/sessions/",
            {"date_from": date_value, "date_to": date_value},
        ).json()["sessions"]
        individual = next(row for row in admin_rows if row["id"] == self.individual.id)
        group = next(row for row in admin_rows if row["id"] == self.group_session.id)
        self.assertEqual(
            individual["individual_participant"],
            {"id": self.student.id, "full_name": self.student.full_name},
        )
        self.assertEqual(individual["presentation_type_label"], "Персональная тренировка")
        self.assertIsNone(group["individual_participant"])

        trainer_client = Client()
        trainer_client.force_login(self.trainer.user)
        trainer_rows = trainer_client.get(
            "/api/trainer/sessions/",
            {"date_from": date_value, "date_to": date_value},
        ).json()["sessions"]
        trainer_individual = next(row for row in trainer_rows if row["id"] == self.individual.id)
        self.assertEqual(
            trainer_individual["individual_participant"],
            {"id": self.student.id, "full_name": self.student.full_name},
        )
        self.assertEqual(trainer_individual["presentation_type_label"], "Персональная тренировка")

        other_trainer_client = Client()
        other_trainer_client.force_login(self.other_trainer.user)
        self.assertEqual(
            other_trainer_client.get(
                "/api/trainer/sessions/",
                {"date_from": date_value, "date_to": date_value},
            ).json()["sessions"],
            [],
        )

        parent_client = Client()
        parent_client.force_login(self.student.parent.user)
        parent_rows = parent_client.get(
            "/api/client/schedule/",
            {
                "student_id": self.student.id,
                "date_from": date_value,
                "date_to": date_value,
            },
        ).json()["sessions"]
        self.assertEqual(parent_rows[0]["individual_participant"]["id"], self.student.id)
        self.assertEqual(parent_rows[0]["presentation_type_label"], "Персональная тренировка")
        self.assertNotIn(self.foreign_student.full_name, json.dumps(parent_rows))

        foreign_client = Client()
        foreign_client.force_login(self.foreign_student.parent.user)
        self.assertEqual(
            foreign_client.get(
                "/api/client/schedule/",
                {
                    "student_id": self.foreign_student.id,
                    "date_from": date_value,
                    "date_to": date_value,
                },
            ).json()["sessions"],
            [],
        )

    def test_split_restore_is_admin_only_idempotent_and_audited(self):
        SessionTypeConfig.objects.filter(code=SessionType.SPLIT).delete()
        admin_client = Client()
        admin_client.force_login(self.admin)

        listing = admin_client.get("/api/admin/settings/session-types/")
        split = next(row for row in listing.json()["session_types"] if row["code"] == "split")
        self.assertFalse(split["configured"])
        self.assertTrue(split["repair_available"])

        restored = admin_client.post("/api/admin/settings/session-types/split/restore/")
        replay = admin_client.post("/api/admin/settings/session-types/split/restore/")
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(SessionTypeConfig.objects.get(code=SessionType.SPLIT).is_active)
        self.assertEqual(
            AuditLogEntry.objects.filter(
                action="admin_settings.SessionTypeConfig.system_type_restored").count(),
            2,
        )

        trainer_client = Client()
        trainer_client.force_login(self.trainer.user)
        self.assertEqual(
            trainer_client.post("/api/admin/settings/session-types/split/restore/").status_code,
            403,
        )


class Prompt05AccessLifecycleTest(TestCase):
    password = "Q7!vL2#pN9$xR4@m"

    def setUp(self):
        self.admin = f.make_admin("prompt05_access_admin")
        self.admin_client = Client()
        self.admin_client.force_login(self.admin)

    def _unactivated_parent(self, username="prompt05_access_parent"):
        account = f.make_parent(username)
        account.email = f"{username}@example.test"
        account.user.email = account.email
        account.user.set_unusable_password()
        account.user.save(update_fields=["email", "password"])
        account.save(update_fields=["email"])
        student = f.make_student(parent=account)
        return account, student

    def test_client_issue_supersede_consume_revoke_and_restore(self):
        account, student = self._unactivated_parent()
        first = self.admin_client.post(f"/api/admin/clients/{account.id}/access/issue/")
        second = self.admin_client.post(f"/api/admin/clients/{account.id}/access/issue/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.json()["purpose"], AccessPurpose.ACTIVATION)
        self.assertEqual(second.json()["login"], account.email)
        self.assertNotIn("password", second.json())
        activation = AccountActivation.objects.get(
            token_hash=hashlib.sha256(second.json()["activation_code"].encode()).hexdigest())
        self.assertNotEqual(activation.token_hash, second.json()["activation_code"])
        self.assertIsNone(activation.used_at)

        superseded = Client().post(
            "/api/auth/activate/",
            {"activation_token": first.json()["activation_code"], "password": self.password},
            content_type="application/json",
        )
        self.assertEqual(superseded.status_code, 400)
        activated = Client().post(
            "/api/auth/activate/",
            {"activation_token": second.json()["activation_code"], "password": self.password},
            content_type="application/json",
        )
        self.assertEqual(activated.status_code, 200)
        self.assertEqual(
            Client().post(
                "/api/auth/activate/",
                {"activation_token": second.json()["activation_code"], "password": self.password},
                content_type="application/json",
            ).status_code,
            400,
        )

        portal_client = Client()
        login = portal_client.post(
            "/api/auth/login/",
            {"login": account.email.upper(), "password": self.password},
            content_type="application/json",
        )
        self.assertEqual(login.status_code, 200)
        revoked = self.admin_client.post(f"/api/admin/clients/{account.id}/access/revoke/")
        self.assertEqual(revoked.status_code, 200)
        student.refresh_from_db()
        self.assertTrue(student.is_active)
        self.assertEqual(portal_client.get("/api/me/").status_code, 403)

        restored = self.admin_client.post(f"/api/admin/clients/{account.id}/access/restore/")
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(restored.json()["purpose"], AccessPurpose.RECOVERY)
        account.user.refresh_from_db()
        self.assertTrue(account.user.is_active)
        self.assertTrue(AuditLogEntry.objects.filter(action="portal_access.revoked").exists())
        self.assertTrue(AuditLogEntry.objects.filter(action="portal_access.restored").exists())

    def test_trainer_uses_same_workflow_without_archiving_profile(self):
        trainer = f.make_trainer("prompt05_access_trainer")
        trainer.user.email = "trainer-access@example.test"
        trainer.user.set_unusable_password()
        trainer.user.save(update_fields=["email", "password"])

        issued = self.admin_client.post(f"/api/admin/trainers/{trainer.id}/access/issue/")
        self.assertEqual(issued.status_code, 201)
        activated = Client().post(
            "/api/auth/activate/",
            {"activation_token": issued.json()["activation_code"], "password": self.password},
            content_type="application/json",
        )
        self.assertEqual(activated.status_code, 200)

        self.admin_client.post(f"/api/admin/trainers/{trainer.id}/access/revoke/")
        trainer.refresh_from_db()
        self.assertTrue(trainer.is_active)
        restored = self.admin_client.post(f"/api/admin/trainers/{trainer.id}/access/restore/")
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(restored.json()["purpose"], AccessPurpose.RECOVERY)

    def test_expired_foreign_role_and_ambiguous_email_fail_closed(self):
        account, _ = self._unactivated_parent("prompt05_expired")
        issued = self.admin_client.post(f"/api/admin/clients/{account.id}/access/issue/")
        activation = AccountActivation.objects.get(
            token_hash=hashlib.sha256(issued.json()["activation_code"].encode()).hexdigest())
        activation.expires_at = timezone.now() - timedelta(seconds=1)
        activation.save(update_fields=["expires_at"])
        self.assertEqual(
            Client().post(
                "/api/auth/activate/",
                {"activation_token": issued.json()["activation_code"], "password": self.password},
                content_type="application/json",
            ).status_code,
            400,
        )

        raw = "foreign-role-code"
        AccountActivation.objects.create(
            user=self.admin,
            purpose=AccessPurpose.ACTIVATION,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            expires_at=timezone.now() + timedelta(hours=1),
        )
        self.assertEqual(
            Client().post(
                "/api/auth/activate/",
                {"activation_token": raw, "password": self.password},
                content_type="application/json",
            ).status_code,
            400,
        )

        one = User.objects.create_user(
            username="ambiguous-one", email="ambiguous@example.test", password=self.password)
        two = User.objects.create_user(
            username="ambiguous-two", email="AMBIGUOUS@example.test", password=self.password)
        self.assertNotEqual(one.id, two.id)
        self.assertEqual(
            Client().post(
                "/api/auth/login/",
                {"login": "ambiguous@example.test", "password": self.password},
                content_type="application/json",
            ).status_code,
            400,
        )

    def test_creation_rejects_duplicate_email_and_missing_login(self):
        account, _ = self._unactivated_parent("prompt05_duplicate")
        duplicate = self.admin_client.post(
            "/api/admin/trainers/",
            data=json.dumps({"trainer": {
                "first_name": "Duplicate",
                "email": account.email.upper(),
            }}),
            content_type="application/json",
        )
        missing = self.admin_client.post(
            "/api/admin/clients/",
            data=json.dumps({"account": {
                "first_name": "Missing",
                "phone": "+48555123456",
            }}),
            content_type="application/json",
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(missing.status_code, 400)

    def test_non_admin_cannot_issue_access(self):
        account, _ = self._unactivated_parent("prompt05_non_admin")
        client = Client()
        client.force_login(account.user)
        self.assertEqual(
            client.post(f"/api/admin/clients/{account.id}/access/issue/").status_code,
            403,
        )
