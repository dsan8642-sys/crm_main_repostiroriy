from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_unified_account_access"),
    ]

    operations = [
        migrations.AlterField(
            model_name="parentaccount",
            name="phone",
            field=models.CharField(blank=True, help_text="Один телефон на семью (без дубликатов)", max_length=32),
        ),
        migrations.AddField(
            model_name="parentaccount",
            name="instagram_username",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]
