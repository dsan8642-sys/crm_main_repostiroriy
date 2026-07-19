from django.contrib import admin

from .models import (PayrollAdjustment, PayrollCalculation, PayrollPeriod,
                     PayrollRule, PayrollScheme, TrainerPayrollAssignment)


@admin.register(PayrollScheme)
class PayrollSchemeAdmin(admin.ModelAdmin):
    list_display = ("name", "location", "is_active", "updated_at")
    list_filter = ("is_active", "location")
    search_fields = ("name", "location")


@admin.register(PayrollRule)
class PayrollRuleAdmin(admin.ModelAdmin):
    list_display = ("scheme", "session_type", "rule_type", "base_amount_minor",
                    "min_clients_threshold", "extra_client_amount_minor", "currency", "is_active")
    list_filter = ("scheme", "session_type", "rule_type", "is_active", "currency")


@admin.register(TrainerPayrollAssignment)
class TrainerPayrollAssignmentAdmin(admin.ModelAdmin):
    list_display = ("trainer", "scheme", "effective_from", "effective_to")
    list_filter = ("scheme",)
    autocomplete_fields = ("trainer", "scheme")


@admin.register(PayrollPeriod)
class PayrollPeriodAdmin(admin.ModelAdmin):
    list_display = ("date_from", "date_to", "location", "status", "updated_at")
    list_filter = ("status", "location")


@admin.register(PayrollCalculation)
class PayrollCalculationAdmin(admin.ModelAdmin):
    list_display = ("period", "trainer", "session", "attended_clients_count",
                    "final_amount_minor", "currency")
    list_filter = ("period", "trainer", "currency")
    readonly_fields = ("created_at",)


@admin.register(PayrollAdjustment)
class PayrollAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("period", "trainer", "amount_minor", "currency", "created_by", "created_at")
    list_filter = ("period", "trainer", "currency")
