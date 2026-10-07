from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0002_attendancerecord_financial_effects_enabled"),
    ]

    operations = [
        migrations.AlterField(
            model_name="attendancerecord",
            name="status",
            field=models.CharField(
                max_length=16,
                choices=[
                    ("present", "Присутствовал"),
                    ("absent", "Отсутствовал"),
                    ("excused", "Отсутствовал по уважительной причине"),
                    ("rescheduled", "Перенос"),
                ],
                null=True,
                blank=True,
            ),
        ),
    ]
