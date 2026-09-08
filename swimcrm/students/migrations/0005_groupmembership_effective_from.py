from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0004_group_memberships"),
    ]

    operations = [
        migrations.AddField(
            model_name="groupmembership",
            name="effective_from",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
