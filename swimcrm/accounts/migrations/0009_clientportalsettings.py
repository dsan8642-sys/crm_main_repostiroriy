import os

from django.db import migrations, models


def seed_history_cutoff_from_environment(apps, schema_editor):
    raw_date = os.environ.get("CLIENT_PORTAL_HISTORY_FROM", "").strip()
    if not raw_date:
        return
    from datetime import date

    cutoff = date.fromisoformat(raw_date)
    ClientPortalSettings = apps.get_model("accounts", "ClientPortalSettings")
    ClientPortalSettings.objects.using(schema_editor.connection.alias).get_or_create(
        pk=1, defaults={"history_from": cutoff},
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0008_adminotpdevice_last_used_counter")]

    operations = [
        migrations.CreateModel(
            name="ClientPortalSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("history_from", models.DateField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"verbose_name": "Настройки клиентского кабинета"},
        ),
        migrations.RunPython(seed_history_cutoff_from_environment, migrations.RunPython.noop),
    ]
