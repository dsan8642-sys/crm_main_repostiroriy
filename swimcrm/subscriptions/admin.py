from django.contrib import admin

from .models import FreezePeriod, SessionLedgerEntry, Subscription
from .services import renew_subscription


class FreezeInline(admin.TabularInline):
    model = FreezePeriod
    extra = 0


class LedgerInline(admin.TabularInline):
    model = SessionLedgerEntry
    extra = 0
    readonly_fields = ("delta", "reason", "attendance", "note", "created_by", "created_at")
    can_delete = False


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("student", "subscription_type", "start_date", "effective_end_date",
                    "remaining_sessions", "status")
    list_filter = ("status", "subscription_type", "student__group", "start_date")
    search_fields = (
        "student__first_name", "student__last_name", "student__email",
        "student__parent__phone", "student__group__name",
        "subscription_type__name",
    )
    autocomplete_fields = ("student", "subscription_type")
    date_hierarchy = "start_date"
    inlines = [FreezeInline, LedgerInline]
    readonly_fields = ("effective_end_date", "remaining_sessions", "total_frozen_days")
    actions = ["renew_same_type"]

    @admin.action(description="Продлить тем же типом с сегодня (остаток переносится)")
    def renew_same_type(self, request, queryset):
        # Decision #1: renewal carries the remaining balance over. New type/start
        # can be chosen per-subscription later; the bulk action uses same type/today.
        renewed = 0
        for sub in queryset:
            renew_subscription(subscription=sub, created_by=request.user)
            renewed += 1
        self.message_user(request, f"Продлено абонементов: {renewed}")


@admin.register(SessionLedgerEntry)
class LedgerAdmin(admin.ModelAdmin):
    list_display = ("subscription", "delta", "reason", "created_at", "created_by")
    list_filter = ("reason", "created_at", "subscription__subscription_type")
    search_fields = (
        "subscription__student__first_name", "subscription__student__last_name",
        "subscription__student__parent__phone", "subscription__subscription_type__name",
        "note", "created_by__username",
    )
    autocomplete_fields = ("subscription", "attendance", "created_by")
    date_hierarchy = "created_at"
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False
