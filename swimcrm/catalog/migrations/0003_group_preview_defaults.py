from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_group_currency_group_price_minor"),
    ]

    operations = [
        migrations.AddField(
            model_name="group",
            name="default_capacity",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Вместимость по умолчанию для новых групповых занятий",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="group",
            name="color_key",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.AddConstraint(
            model_name="group",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(default_capacity__isnull=True)
                    | models.Q(default_capacity__gt=0)
                ),
                name="catalog_group_default_capacity_positive",
            ),
        ),
    ]
