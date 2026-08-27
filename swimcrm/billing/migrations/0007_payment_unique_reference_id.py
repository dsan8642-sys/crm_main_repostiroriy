from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("billing", "0006_payment_reference_id")]

    operations = [
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                fields=("reference_id",),
                condition=~Q(reference_id=""),
                name="billing_payment_unique_nonempty_reference_id",
            ),
        ),
    ]
