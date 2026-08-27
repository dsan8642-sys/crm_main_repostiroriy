import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_group_preview_defaults"),
        ("scheduling", "0005_location_session_type_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="group",
            name="default_location",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="default_groups",
                to="scheduling.location",
            ),
        ),
    ]
