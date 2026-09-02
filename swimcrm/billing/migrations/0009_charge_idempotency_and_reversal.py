import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0008_one_charge_per_subscription"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="charge",
            name="reference_id",
            field=models.CharField(blank=True, db_index=True, max_length=128),
        ),
        migrations.AddConstraint(
            model_name="charge",
            constraint=models.UniqueConstraint(
                fields=("reference_id",),
                condition=~Q(reference_id=""),
                name="billing_charge_unique_nonempty_reference_id",
            ),
        ),
        migrations.CreateModel(
            name="ChargeReversal",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "amount_minor",
                    models.BigIntegerField(
                        validators=[django.core.validators.MinValueValidator(1)],
                    ),
                ),
                (
                    "currency",
                    models.CharField(
                        choices=[("PLN", "PLN"), ("EUR", "EUR"), ("USD", "USD")],
                        max_length=3,
                    ),
                ),
                ("reason", models.TextField()),
                (
                    "reference_id",
                    models.CharField(blank=True, db_index=True, max_length=128),
                ),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "charge",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="reversal",
                        to="billing.charge",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_charge_reversals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="chargereversal",
            constraint=models.UniqueConstraint(
                fields=("reference_id",),
                condition=~Q(reference_id=""),
                name="billing_charge_reversal_unique_nonempty_reference_id",
            ),
        ),
    ]
