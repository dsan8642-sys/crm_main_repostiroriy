from django.contrib import admin

from audit.mixins import AuditAdminMixin

from .models import Charge, Payment, PaymentEvent, ReceiptFile


@admin.register(Charge)
class ChargeAdmin(AuditAdminMixin, admin.ModelAdmin):
    list_display = ("student", "description", "amount", "due_date", "subscription", "created_by")
    list_filter = ("currency", "due_date", "student__groups")
    search_fields = (
        "student__first_name", "student__last_name", "student__email",
        "student__parent__phone", "student__groups__name",
        "description",
    )
    autocomplete_fields = ("student", "subscription", "created_by")
    date_hierarchy = "due_date"
    immutable_history_fields = (
        "student", "subscription", "description", "amount_minor", "currency",
        "due_date", "created_by", "created_at",
    )

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj))
        if obj:
            fields.extend(field for field in self.immutable_history_fields if field not in fields)
        return tuple(fields)

    def has_delete_permission(self, request, obj=None):
        return False


class ReceiptInline(admin.TabularInline):
    model = ReceiptFile
    extra = 0
    readonly_fields = ("uploaded_by", "uploaded_at", "is_deleted", "deleted_at")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(AuditAdminMixin, admin.ModelAdmin):
    list_display = (
        "student", "amount", "source", "method", "status", "paid_at",
        "confirmed_by", "confirmed_at",
    )
    list_filter = ("source", "status", "method", "currency", "paid_at", "student__groups")
    search_fields = (
        "student__first_name", "student__last_name", "student__email",
        "student__parent__phone", "student__groups__name",
        "comment", "confirmed_by__username", "confirmed_by__first_name",
        "confirmed_by__last_name",
    )
    autocomplete_fields = ("student", "created_by", "confirmed_by")
    date_hierarchy = "paid_at"
    inlines = [ReceiptInline]
    readonly_fields = ("confirmed_at",)

    immutable_history_fields = (
        "student", "amount_minor", "currency", "paid_at", "method", "status", "source",
        "created_by", "confirmed_by", "confirmed_at",
    )

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj))
        if obj:
            fields.extend(field for field in self.immutable_history_fields if field not in fields)
        return tuple(fields)

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ReceiptFile)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ("payment", "uploaded_by", "uploaded_at", "is_deleted", "deleted_at")
    list_filter = ("is_deleted", "uploaded_at", "deleted_at")
    search_fields = (
        "payment__student__first_name", "payment__student__last_name",
        "payment__student__parent__phone", "uploaded_by__phone",
        "uploaded_by__user__first_name", "uploaded_by__user__last_name",
        "original_name",
    )
    autocomplete_fields = ("payment", "uploaded_by")
    date_hierarchy = "uploaded_at"
    readonly_fields = ("uploaded_at", "is_deleted", "deleted_at")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentEvent)
class PaymentEventAdmin(admin.ModelAdmin):
    list_display = (
        "payment", "event_type", "from_status", "to_status", "actor", "created_at")
    list_filter = ("event_type", "to_status", "currency", "created_at")
    search_fields = (
        "payment__student__first_name", "payment__student__last_name",
        "actor__username", "note",
    )
    readonly_fields = (
        "payment", "event_type", "actor", "from_status", "to_status",
        "amount_minor", "currency", "note", "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
