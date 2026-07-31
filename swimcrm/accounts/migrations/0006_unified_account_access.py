import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_activation_users(apps, schema_editor):
    AccountActivation = apps.get_model("accounts", "AccountActivation")
    for activation in AccountActivation.objects.exclude(parent_id=None).select_related("parent").iterator():
        activation.user_id = activation.parent.user_id
        activation.save(update_fields=["user"])


def remove_trainer_only_tokens(apps, schema_editor):
    AccountActivation = apps.get_model("accounts", "AccountActivation")
    AccountActivation.objects.filter(parent_id=None).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_accountactivation"),
    ]

    operations = [
        migrations.AlterField(
            model_name="accountactivation",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="activations",
                to="accounts.parentaccount",
            ),
        ),
        migrations.AddField(
            model_name="accountactivation",
            name="purpose",
            field=models.CharField(
                choices=[("activation", "Activation"), ("recovery", "Recovery")],
                default="activation",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="accountactivation",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="account_activations",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_activation_users, remove_trainer_only_tokens),
    ]
