from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0002_remove_student_phone"),
    ]

    operations = [
        migrations.AddField(
            model_name="student",
            name="is_account_holder",
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name="student",
            constraint=models.UniqueConstraint(
                fields=("parent",),
                condition=Q(is_account_holder=True),
                name="uniq_account_holder_participant_per_client",
            ),
        ),
    ]
