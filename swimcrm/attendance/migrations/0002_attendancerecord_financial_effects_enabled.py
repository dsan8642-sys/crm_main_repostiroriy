from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attendance", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendancerecord",
            name="financial_effects_enabled",
            field=models.BooleanField(default=True, editable=False),
        ),
    ]
