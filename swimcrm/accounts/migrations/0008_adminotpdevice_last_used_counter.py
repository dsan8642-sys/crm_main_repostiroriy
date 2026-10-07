from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0007_parentaccount_instagram_username")]

    operations = [
        migrations.AddField(
            model_name="adminotpdevice",
            name="last_used_counter",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
    ]
