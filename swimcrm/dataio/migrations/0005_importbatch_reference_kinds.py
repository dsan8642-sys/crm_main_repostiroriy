from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("dataio", "0004_importbatch_created_subscription_ids")]

    operations = [
        migrations.AlterField(
            model_name="importbatch",
            name="kind",
            field=models.CharField(
                choices=[
                    ("clients", "Clients"),
                    ("attendance", "Attendance"),
                    ("payments", "Payments"),
                    ("groups", "Groups"),
                    ("trainers", "Trainers"),
                ],
                default="clients",
                max_length=16,
            ),
        ),
    ]
