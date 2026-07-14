from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0003_alter_notificationlog_event_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationlog",
            name="body",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="notificationlog",
            name="delivered_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="notificationlog",
            name="last_attempt_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="notificationlog",
            name="provider_message_id",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="notificationlog",
            name="subject",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddConstraint(
            model_name="notificationrule",
            constraint=models.UniqueConstraint(
                fields=("event_type", "channel", "offset_minutes"),
                name="uniq_notification_rule_event_channel_offset",
            ),
        ),
    ]
