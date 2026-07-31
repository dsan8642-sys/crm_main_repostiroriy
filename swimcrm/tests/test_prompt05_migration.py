import hashlib
from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class UnifiedAccountAccessMigrationTest(TransactionTestCase):
    migrate_from = [("accounts", "0005_accountactivation")]
    migrate_to = [("accounts", "0006_unified_account_access")]

    def test_forward_backfills_clients_and_reverse_removes_trainer_only_tokens(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        User = old_apps.get_model("accounts", "User")
        ParentAccount = old_apps.get_model("accounts", "ParentAccount")
        Activation = old_apps.get_model("accounts", "AccountActivation")
        user = User.objects.create(username="migration-parent", role="parent")
        parent = ParentAccount.objects.create(user=user, phone="+48555000001")
        client_hash = hashlib.sha256(b"legacy-client").hexdigest()
        Activation.objects.create(
            parent=parent,
            token_hash=client_hash,
            expires_at=timezone.now() + timedelta(hours=1),
        )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        new_apps = executor.loader.project_state(self.migrate_to).apps
        NewUser = new_apps.get_model("accounts", "User")
        NewActivation = new_apps.get_model("accounts", "AccountActivation")
        migrated = NewActivation.objects.get(token_hash=client_hash)
        self.assertEqual(migrated.user_id, user.id)
        self.assertEqual(migrated.purpose, "activation")
        trainer = NewUser.objects.create(username="migration-trainer", role="trainer")
        trainer_hash = hashlib.sha256(b"trainer-only").hexdigest()
        NewActivation.objects.create(
            user=trainer,
            parent=None,
            purpose="recovery",
            token_hash=trainer_hash,
            expires_at=timezone.now() + timedelta(hours=1),
        )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        reversed_apps = executor.loader.project_state(self.migrate_from).apps
        ReversedActivation = reversed_apps.get_model("accounts", "AccountActivation")
        self.assertTrue(ReversedActivation.objects.filter(token_hash=client_hash).exists())
        self.assertFalse(ReversedActivation.objects.filter(token_hash=trainer_hash).exists())

        MigrationExecutor(connection).migrate(self.migrate_to)
