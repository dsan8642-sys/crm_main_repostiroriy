from django.contrib import admin

from .models import ImportBatch


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ("created_at", "source_name", "rows_imported", "rows_total", "is_rolled_back", "created_by")
    list_filter = ("is_rolled_back",)
    readonly_fields = ("created_student_ids", "created_group_ids", "created_parent_ids")
