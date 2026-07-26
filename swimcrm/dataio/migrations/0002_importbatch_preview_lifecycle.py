import django.utils.timezone
from django.db import migrations, models


def mark_existing_batches_committed(apps, schema_editor):
    batch_model = apps.get_model("dataio", "ImportBatch")
    batch_model.objects.filter(committed_at__isnull=True).update(
        committed_at=models.F("created_at"))
    batch_model.objects.filter(is_rolled_back=True).update(status="rolled_back")


class Migration(migrations.Migration):

    dependencies = [
        ("dataio", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="importbatch",
            name="kind",
            field=models.CharField(
                choices=[
                    ("clients", "Clients"),
                    ("attendance", "Attendance"),
                    ("payments", "Payments"),
                ],
                default="clients",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="importbatch",
            name="status",
            field=models.CharField(
                choices=[
                    ("previewed", "Previewed"),
                    ("committed", "Committed"),
                    ("rolled_back", "Rolled back"),
                ],
                default="committed",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="importbatch",
            name="input_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="importbatch",
            name="preview_expires_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="importbatch",
            name="committed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="importbatch",
            name="result",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(
            code=mark_existing_batches_committed,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
