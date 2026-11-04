from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def move_legacy_comments(apps, schema_editor):
    Student = apps.get_model("students", "Student")
    ParticipantNote = apps.get_model("students", "ParticipantNote")
    for student in Student.objects.exclude(admin_comments="").iterator():
        if student.admin_comments.strip():
            ParticipantNote.objects.create(student_id=student.pk, body=student.admin_comments.strip(), imported=True)
        student.admin_comments = ""
        student.save(update_fields=["admin_comments"])


class Migration(migrations.Migration):
    dependencies = [
        ("students", "0006_student_photo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ParticipantNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("body", models.TextField()),
                ("imported", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("author", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="internal_notes", to="students.student")),
            ],
            options={"ordering": ("-created_at", "-id")},
        ),
        migrations.RunPython(move_legacy_comments, migrations.RunPython.noop),
    ]
