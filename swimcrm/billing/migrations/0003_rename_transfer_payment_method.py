from django.db import migrations, models


def forwards(apps, schema_editor):
    Payment = apps.get_model("billing", "Payment")
    Payment.objects.filter(method="transfer").update(method="bank_transfer")


def backwards(apps, schema_editor):
    Payment = apps.get_model("billing", "Payment")
    Payment.objects.filter(method="bank_transfer").update(method="transfer")


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0002_alter_receiptfile_file"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name="payment",
            name="method",
            field=models.CharField(
                choices=[
                    ("cash", "Наличные"),
                    ("bank_transfer", "Bank transfer"),
                    ("card", "Карта"),
                    ("other", "Другое"),
                ],
                default="cash",
                max_length=16,
            ),
        ),
    ]
