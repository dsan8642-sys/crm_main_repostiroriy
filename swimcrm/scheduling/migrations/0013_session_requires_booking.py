from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0006_group_self_booking"),
        ("scheduling", "0012_sessiontypeconfig_color_key"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sessionparticipant", name="source",
            field=models.CharField(
                choices=[("manual", "Manual"), ("client", "Client"), ("waitlist", "Waitlist")],
                default="manual", max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="session", name="requires_booking",
            field=models.BooleanField(default=False),
        ),
    ]
