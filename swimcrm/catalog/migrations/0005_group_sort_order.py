from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_group_default_location"),
    ]

    operations = [
        migrations.AddField(
            model_name="group",
            name="sort_order",
            field=models.PositiveIntegerField(
                blank=True,
                db_index=True,
                help_text="Позиция группы в навигационных списках; меньшее число выше",
                null=True,
            ),
        ),
    ]
