from datetime import date

from django.db import migrations


def migrate_rates(apps, schema_editor):
    Rule = apps.get_model("payroll", "PayrollRule")
    Rate = apps.get_model("payroll", "PayrollRate")
    Version = apps.get_model("payroll", "PayrollRateVersion")
    Assignment = apps.get_model("payroll", "TrainerPayrollAssignment")
    for rule in Rule.objects.select_related("scheme").all():
        rate = Rate.objects.create(
            name=f"{rule.scheme.name} · {rule.get_session_type_display()}",
            session_type=rule.session_type, is_active=rule.is_active and rule.scheme.is_active,
        )
        Version.objects.create(
            rate=rate, effective_from=date(1900, 1, 1),
            base_amount_minor=rule.base_amount_minor, currency=rule.currency,
            min_clients_threshold=rule.min_clients_threshold,
            extra_client_amount_minor=rule.extra_client_amount_minor,
        )
        for old in Assignment.objects.filter(scheme_id=rule.scheme_id) if rate.is_active else []:
            Assignment.objects.create(
                trainer_id=old.trainer_id, rate=rate, location=rule.scheme.location,
                effective_from=old.effective_from, effective_to=old.effective_to,
            )


class Migration(migrations.Migration):
    dependencies = [("payroll", "0002_payrollrate_trainerpayrollassignment_location_and_more")]
    operations = [migrations.RunPython(migrate_rates, migrations.RunPython.noop)]
