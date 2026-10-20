import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0009_charge_idempotency_and_reversal"),
    ]

    operations = [
        migrations.AlterField(
            model_name="chargereversal",
            name="amount_minor",
            field=models.BigIntegerField(validators=[django.core.validators.MinValueValidator(0)]),
        ),
    ]
