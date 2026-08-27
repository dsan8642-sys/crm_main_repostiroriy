from audit.models import audit


def audit_admin_settings(actor, instance, operation, changes=None):
    audit(
        actor,
        f"admin_settings.{type(instance).__name__}.{operation}",
        instance,
        {"source": "admin_settings_api", **(changes or {})},
    )
