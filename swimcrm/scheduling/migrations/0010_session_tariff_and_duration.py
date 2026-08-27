from datetime import timedelta

from django.db import migrations, models
from django.db.models import Q


def normalize_duration(apps, schema_editor):
    Session = apps.get_model("scheduling", "Session")
    for session in Session.objects.all().iterator():
        minutes = round((session.end_at - session.start_at).total_seconds() / 60 / 5) * 5
        minutes = min(480, max(15, int(minutes)))
        session.duration_minutes = minutes
        session.end_at = session.start_at + timedelta(minutes=minutes)
        session.save(update_fields=["duration_minutes", "end_at"])


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0009_session_price_snapshot")]

    operations = [
        migrations.AddField(model_name="sessiontypeconfig", name="default_price_minor",
                            field=models.BigIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="sessiontypeconfig", name="default_currency",
                            field=models.CharField(choices=[("PLN", "PLN"), ("EUR", "EUR"), ("USD", "USD")], default="PLN", max_length=3)),
        migrations.AddField(model_name="sessiontypeconfig", name="default_duration_minutes",
                            field=models.PositiveSmallIntegerField(default=60)),
        migrations.AddField(model_name="session", name="duration_minutes",
                            field=models.PositiveSmallIntegerField(default=60)),
        migrations.RunPython(normalize_duration, migrations.RunPython.noop),
        migrations.AddConstraint(model_name="session", constraint=models.CheckConstraint(
            condition=Q(duration_minutes__gte=15) & Q(duration_minutes__lte=480),
            name="session_duration_minutes_range")),
    ]
