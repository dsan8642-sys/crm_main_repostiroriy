from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dataio", "0002_importbatch_preview_lifecycle"),
    ]

    operations = [
        migrations.AddField(
            model_name="importbatch",
            name="effect_mode",
            field=models.CharField(
                choices=[
                    ("not_applicable", "Not applicable"),
                    ("history_only", "History only"),
                    ("apply_financial", "Apply financial effects"),
                ],
                default="not_applicable",
                max_length=24,
            ),
        ),
    ]
