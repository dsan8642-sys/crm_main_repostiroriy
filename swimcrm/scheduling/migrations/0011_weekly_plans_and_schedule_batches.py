from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def migrate_templates(apps, schema_editor):
    Group = apps.get_model("catalog", "Group")
    RecurringTemplate = apps.get_model("scheduling", "RecurringTemplate")
    WeeklyPlan = apps.get_model("scheduling", "WeeklyPlan")
    WeeklyPlanSlot = apps.get_model("scheduling", "WeeklyPlanSlot")
    for group in Group.objects.all().iterator():
        templates = list(RecurringTemplate.objects.filter(group_id=group.id).order_by("id"))
        if not templates:
            continue
        plan = WeeklyPlan.objects.create(
            group_id=group.id,
            name="Основное расписание",
            is_active=any(template.is_active for template in templates),
        )
        for template in templates:
            minutes = round(
                (
                    template.end_time.hour * 60 + template.end_time.minute
                    - template.start_time.hour * 60 - template.start_time.minute
                ) / 5
            ) * 5
            minutes = min(480, max(15, minutes))
            WeeklyPlanSlot.objects.get_or_create(
                plan_id=plan.id,
                weekday=template.weekday,
                start_time=template.start_time,
                defaults={
                    "trainer_id": template.trainer_id,
                    "duration_minutes": minutes,
                    "location": template.location,
                    "max_participants": template.max_participants,
                    "is_active": template.is_active,
                },
            )


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0010_session_tariff_and_duration")]

    operations = [
        migrations.CreateModel(
            name="WeeklyPlan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="weekly_plans", to="catalog.group")),
            ],
            options={"ordering": ["group__name", "name", "id"]},
        ),
        migrations.CreateModel(
            name="ScheduleOperationBatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("operation", models.CharField(default="copy_period", max_length=32)),
                ("status", models.CharField(choices=[("previewed", "Previewed"), ("committed", "Committed")], default="previewed", max_length=16)),
                ("input_data", models.JSONField(default=dict)),
                ("preview", models.JSONField(default=list)),
                ("result", models.JSONField(default=dict)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("committed_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="accounts.user")),
            ],
        ),
        migrations.CreateModel(
            name="WeeklyPlanSlot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("weekday", models.IntegerField(choices=[(0, "Понедельник"), (1, "Вторник"), (2, "Среда"), (3, "Четверг"), (4, "Пятница"), (5, "Суббота"), (6, "Воскресенье")])),
                ("start_time", models.TimeField()),
                ("duration_minutes", models.PositiveSmallIntegerField(default=60)),
                ("location", models.CharField(max_length=120)),
                ("max_participants", models.PositiveIntegerField()),
                ("is_active", models.BooleanField(default=True)),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="slots", to="scheduling.weeklyplan")),
                ("trainer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="weekly_plan_slots", to="accounts.trainer")),
            ],
            options={"ordering": ["weekday", "start_time", "id"]},
        ),
        migrations.AddConstraint(
            model_name="weeklyplanslot",
            constraint=models.UniqueConstraint(fields=("plan", "weekday", "start_time"), name="uniq_weekly_plan_slot_time"),
        ),
        migrations.AddField(
            model_name="session",
            name="weekly_plan_slot",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sessions", to="scheduling.weeklyplanslot"),
        ),
        migrations.RunPython(migrate_templates, migrations.RunPython.noop),
    ]
