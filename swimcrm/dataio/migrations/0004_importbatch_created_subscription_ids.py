from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("dataio", "0003_importbatch_effect_mode")]

    operations = [
        migrations.AddField(
            model_name="importbatch",
            name="created_subscription_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
