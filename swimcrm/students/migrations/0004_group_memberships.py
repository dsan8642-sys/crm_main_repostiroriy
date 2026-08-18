from django.db import migrations, models
from django.db.migrations.exceptions import IrreversibleError
import django.db.models.deletion


def copy_legacy_groups(apps, schema_editor):
    Student = apps.get_model("students", "Student")
    GroupMembership = apps.get_model("students", "GroupMembership")
    GroupMembership.objects.bulk_create([
        GroupMembership(student_id=student_id, group_id=group_id)
        for student_id, group_id in Student.objects.exclude(group_id=None).values_list("id", "group_id")
    ])


def irreversible(apps, schema_editor):
    raise IrreversibleError(
        "Multiple group memberships cannot be collapsed to the legacy single group field. Restore a database backup.")


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
        ("students", "0003_student_is_account_holder"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroupMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="student_memberships", to="catalog.group")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="group_memberships", to="students.student")),
            ],
            options={"ordering": ("created_at", "id")},
        ),
        migrations.AddConstraint(
            model_name="groupmembership",
            constraint=models.UniqueConstraint(fields=("student", "group"), name="uniq_student_group_membership"),
        ),
        migrations.AddIndex(
            model_name="groupmembership",
            index=models.Index(fields=["group", "student"], name="students_gr_group_i_a18906_idx"),
        ),
        migrations.AddField(
            model_name="student",
            name="groups",
            field=models.ManyToManyField(blank=True, related_name="students", through="students.GroupMembership", to="catalog.group"),
        ),
        migrations.RunPython(copy_legacy_groups, irreversible),
        migrations.RemoveField(model_name="student", name="group"),
        migrations.AlterField(
            model_name="student",
            name="first_name",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AlterField(
            model_name="student",
            name="last_name",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
