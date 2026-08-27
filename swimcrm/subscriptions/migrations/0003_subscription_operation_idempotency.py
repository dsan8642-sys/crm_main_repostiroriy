from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("subscriptions", "0002_alter_sessionledgerentry_reason")]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="idempotency_key",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="idempotency_fingerprint",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddConstraint(
            model_name="subscription",
            constraint=models.UniqueConstraint(
                fields=("idempotency_key",),
                condition=Q(idempotency_key__isnull=False),
                name="subscriptions_unique_operation_key",
            ),
        ),
    ]
