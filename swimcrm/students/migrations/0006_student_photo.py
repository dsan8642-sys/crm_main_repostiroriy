from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("students", "0005_groupmembership_effective_from")]

    operations = [
        migrations.AddField(model_name="student", name="photo", field=models.FileField(blank=True, null=True, upload_to="participant-photos/%Y/%m/")),
        migrations.AddField(model_name="student", name="photo_updated_at", field=models.DateTimeField(blank=True, null=True)),
    ]
