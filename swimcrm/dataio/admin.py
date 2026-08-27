from django.contrib import admin

from .models import ImportBatch


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = (
        "created_at", "kind", "effect_mode", "status", "source_name", "rows_imported",
        "rows_total", "is_rolled_back", "created_by",
    )
    list_filter = ("kind", "effect_mode", "status", "is_rolled_back")
    readonly_fields = (
        "input_data", "result", "created_student_ids", "created_group_ids",
        "created_parent_ids",
        "created_subscription_ids",
    )
