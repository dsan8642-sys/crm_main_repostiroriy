import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_parentaccount_preferred_language"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountActivation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_client_activations", to=settings.AUTH_USER_MODEL)),
                ("parent", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activations", to="accounts.parentaccount")),
            ],
        ),
    ]
