from django.db import migrations, models
from django.db.models import Count, Q


def fail_on_duplicate_subscription_charges(apps, schema_editor):
    Charge = apps.get_model("billing", "Charge")
    duplicate = (
        Charge.objects.exclude(subscription_id=None)
        .values("subscription_id")
        .annotate(row_count=Count("id"))
        .filter(row_count__gt=1)
        .order_by("subscription_id")
        .first()
    )
    if duplicate:
        raise RuntimeError(
            "Cannot enforce one charge per subscription: "
            f"subscription {duplicate['subscription_id']} has "
            f"{duplicate['row_count']} charges. Reconcile duplicates first."
        )


class Migration(migrations.Migration):
    dependencies = [("billing", "0007_payment_unique_reference_id")]

    operations = [
        migrations.RunPython(
            fail_on_duplicate_subscription_charges,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="charge",
            constraint=models.UniqueConstraint(
                fields=("subscription",),
                condition=Q(subscription__isnull=False),
                name="billing_one_charge_per_subscription",
            ),
        ),
    ]
