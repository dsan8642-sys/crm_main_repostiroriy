from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalog", "0005_group_sort_order")]

    operations = [
        migrations.AddField(
            model_name="group", name="self_booking_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="group", name="booking_cutoff_hours",
            field=models.PositiveSmallIntegerField(default=8),
        ),
        migrations.AddConstraint(
            model_name="group",
            constraint=models.CheckConstraint(
                condition=models.Q(booking_cutoff_hours__gte=1),
                name="catalog_group_booking_cutoff_positive",
            ),
        ),
    ]
