import json
import threading
from datetime import timedelta
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone

from accounts.models import AccountActivation

from . import factories as f


class ClientLifecycleApiInvariantTest(TestCase):
    def setUp(self):
        self.admin = f.make_admin(username="client_lifecycle_admin")
        self.account = f.make_parent(username="client_lifecycle_account")
        self.students = [
            f.make_student(
                parent=self.account,
                first=f"Participant{index}",
                last="Lifecycle",
            )
            for index in range(3)
        ]
        self.client.force_login(self.admin)

    def test_edit_after_archive_returns_409_and_cannot_reactivate_account(self):
        archived = self.client.delete(
            f"/api/admin/clients/{self.account.id}/")
        stale_edit = self.client.patch(
            f"/api/admin/clients/{self.account.id}/",
            data=json.dumps({"account": {"first_name": "Stale edit"}}),
            content_type="application/json",
        )

        self.assertEqual(archived.status_code, 200)
        self.assertEqual(stale_edit.status_code, 409)
        self.assertEqual(stale_edit.json()["code"], "client_lifecycle_conflict")
        detail = self.client.get(f"/api/admin/clients/{self.account.id}/").json()
        self.assertFalse(detail["account"]["is_active"])
        self.assertEqual(
            [participant["is_active"] for participant in detail["participants"]],
            [False, False, False],
        )

    def test_separate_field_edits_preserve_both_values(self):
        first = self.client.patch(
            f"/api/admin/clients/{self.account.id}/",
            data=json.dumps({"account": {"first_name": "First"}}),
            content_type="application/json",
        )
        second = self.client.patch(
            f"/api/admin/clients/{self.account.id}/",
            data=json.dumps({"account": {"last_name": "Last"}}),
            content_type="application/json",
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        detail = self.client.get(f"/api/admin/clients/{self.account.id}/").json()
        self.assertEqual(detail["account"]["first_name"], "First")
        self.assertEqual(detail["account"]["last_name"], "Last")

    def test_archive_invalidates_access_code_and_restore_reactivates_all_participants(self):
        activation = AccountActivation.objects.create(
            user=self.account.user,
            token_hash="a" * 64,
            expires_at=timezone.now() + timedelta(hours=1),
            created_by=self.admin,
        )

        archived = self.client.delete(
            f"/api/admin/clients/{self.account.id}/")
        restored = self.client.post(
            f"/api/admin/clients/{self.account.id}/restore/")

        activation.refresh_from_db()
        self.assertEqual(archived.status_code, 200)
        self.assertEqual(restored.status_code, 200)
        self.assertIsNotNone(activation.used_at)
        self.assertTrue(restored.json()["account"]["is_active"])
        self.assertEqual(
            [participant["is_active"] for participant in restored.json()["participants"]],
            [True, True, True],
        )


class ClientLifecyclePostgresConcurrencyTest(TransactionTestCase):
    reset_sequences = True

    @skipUnless(
        connection.vendor == "postgresql",
        "PostgreSQL-only row-locking regression",
    )
    def test_two_concurrent_field_edits_are_merged_without_lost_fields(self):
        admin = f.make_admin(username="client_lifecycle_concurrent_admin")
        account = f.make_parent(username="client_lifecycle_concurrent_account")
        f.make_student(parent=account, first="Concurrent", last="Participant")
        barrier = threading.Barrier(3)
        responses = []

        def edit(payload):
            close_old_connections()
            barrier.wait()
            client = Client()
            client.force_login(admin)
            response = client.patch(
                f"/api/admin/clients/{account.id}/",
                data=json.dumps({"account": payload}),
                content_type="application/json",
            )
            responses.append(response.status_code)
            close_old_connections()

        threads = [
            threading.Thread(target=edit, args=({"first_name": "First"},)),
            threading.Thread(target=edit, args=({"last_name": "Last"},)),
        ]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=10)

        account.user.refresh_from_db()
        self.assertEqual(sorted(responses), [200, 200])
        self.assertEqual(account.user.first_name, "First")
        self.assertEqual(account.user.last_name, "Last")

    @skipUnless(
        connection.vendor == "postgresql",
        "PostgreSQL-only row-locking regression",
    )
    def test_concurrent_edit_and_archive_never_split_account_participant_state(self):
        admin = f.make_admin(username="client_lifecycle_race_admin")
        account = f.make_parent(username="client_lifecycle_race_account")
        participants = [
            f.make_student(
                parent=account,
                first=f"Race{index}",
                last="Participant",
            )
            for index in range(3)
        ]
        control = Client()
        control.force_login(admin)

        for iteration in range(20):
            restored = control.post(f"/api/admin/clients/{account.id}/restore/")
            self.assertEqual(restored.status_code, 200)
            barrier = threading.Barrier(3)
            responses = {}
            errors = []

            def request(method):
                try:
                    close_old_connections()
                    barrier.wait()
                    client = Client()
                    client.force_login(admin)
                    if method == "edit":
                        response = client.patch(
                            f"/api/admin/clients/{account.id}/",
                            data=json.dumps({
                                "account": {"first_name": f"Edit{iteration}"},
                            }),
                            content_type="application/json",
                        )
                    else:
                        response = client.delete(
                            f"/api/admin/clients/{account.id}/")
                    responses[method] = response.status_code
                except Exception as exc:  # pragma: no cover - diagnostic capture
                    errors.append(exc)
                finally:
                    close_old_connections()

            edit_thread = threading.Thread(target=request, args=("edit",))
            archive_thread = threading.Thread(target=request, args=("archive",))
            edit_thread.start()
            archive_thread.start()
            barrier.wait()
            edit_thread.join(timeout=15)
            archive_thread.join(timeout=15)

            self.assertFalse(errors)
            self.assertEqual(responses.get("archive"), 200)
            self.assertIn(responses.get("edit"), {200, 409})
            account.user.refresh_from_db()
            for participant in participants:
                participant.refresh_from_db()
            self.assertFalse(account.user.is_active)
            self.assertTrue(all(not participant.is_active for participant in participants))
