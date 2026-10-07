from django.db import migrations


def add_ukrainian(apps, schema_editor):
    Language = apps.get_model("localization", "Language")
    Language.objects.get_or_create(code="uk", defaults={"name": "Українська", "is_active": True})


class Migration(migrations.Migration):
    dependencies = [("localization", "0001_initial")]
    operations = [migrations.RunPython(add_ukrainian, migrations.RunPython.noop)]
