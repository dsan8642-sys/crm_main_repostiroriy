from django.db import migrations, models
from django.db.models import Q


def backfill_session_prices(apps, schema_editor):
    session_model = apps.get_model("scheduling", "Session")
    charge_model = apps.get_model("billing", "Charge")
    sessions = list(session_model.objects.select_related("group").all())
    for session in sessions:
        existing_charge = charge_model.objects.filter(
            attendance__session_id=session.id,
            amount_minor__gt=0,
        ).order_by("created_at", "id").first()
        if existing_charge is not None:
            session.price_minor = existing_charge.amount_minor
            session.currency = existing_charge.currency
        elif session.group_id:
            session.price_minor = session.group.price_minor
            session.currency = session.group.currency
    if sessions:
        session_model.objects.bulk_update(sessions, ["price_minor", "currency"])


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0005_charge_attendance"),
        ("catalog", "0002_group_currency_group_price_minor"),
        ("scheduling", "0008_session_substitute_trainer"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="price_minor",
            field=models.BigIntegerField(
                blank=True,
                editable=False,
                help_text="Session price snapshot in minor currency units",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="session",
            name="currency",
            field=models.CharField(
                choices=[("PLN", "PLN"), ("EUR", "EUR"), ("USD", "USD")],
                default="PLN",
                editable=False,
                max_length=3,
            ),
        ),
        migrations.RunPython(backfill_session_prices, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="session",
            constraint=models.CheckConstraint(
                condition=Q(price_minor__isnull=True) | Q(price_minor__gte=0),
                name="session_price_minor_nonnegative",
            ),
        ),
    ]
