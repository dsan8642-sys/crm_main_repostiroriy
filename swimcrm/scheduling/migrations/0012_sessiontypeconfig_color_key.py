from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_group_preview_defaults"),
        ("scheduling", "0011_weekly_plans_and_schedule_batches"),
    ]

    operations = [
        migrations.AddField(
            model_name="sessiontypeconfig",
            name="color_key",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
    ]
