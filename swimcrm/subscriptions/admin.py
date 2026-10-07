from django.contrib import admin

from common.admin import ReadOnlyAdminMixin

from .models import FreezePeriod, SessionLedgerEntry, Subscription


class FreezeInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = FreezePeriod
    extra = 0
    readonly_fields = ("start_date", "end_date", "reason", "created_by", "created_at")
    can_delete = False


class LedgerInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = SessionLedgerEntry
    extra = 0
    readonly_fields = ("delta", "reason", "attendance", "note", "created_by", "created_at")
    can_delete = False


@admin.register(Subscription)
class SubscriptionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("student", "subscription_type", "start_date", "effective_end_date",
                    "remaining_sessions", "status")
    list_filter = ("status", "subscription_type", "student__groups", "start_date")
    search_fields = (
        "student__first_name", "student__last_name", "student__email",
        "student__parent__phone", "student__groups__name",
        "subscription_type__name",
    )
    autocomplete_fields = ("student", "subscription_type")
    date_hierarchy = "start_date"
    inlines = [FreezeInline, LedgerInline]
    readonly_fields = ("effective_end_date", "remaining_sessions", "total_frozen_days")


@admin.register(SessionLedgerEntry)
class LedgerAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ("subscription", "delta", "reason", "created_at", "created_by")
    list_filter = ("reason", "created_at", "subscription__subscription_type")
    search_fields = (
        "subscription__student__first_name", "subscription__student__last_name",
        "subscription__student__parent__phone", "subscription__subscription_type__name",
        "note", "created_by__username",
    )
    autocomplete_fields = ("subscription", "attendance", "created_by")
    date_hierarchy = "created_at"
