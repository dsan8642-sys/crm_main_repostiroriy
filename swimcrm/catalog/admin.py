from django.contrib import admin

from .models import Group, SubscriptionType


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "default_trainer", "is_active")
    list_filter = ("is_active", "default_trainer")
    search_fields = ("name", "default_trainer__user__first_name", "default_trainer__user__last_name")
    autocomplete_fields = ("default_trainer",)


@admin.register(SubscriptionType)
class SubscriptionTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "sessions_count", "duration_days", "price", "is_individual", "is_active")
    list_filter = ("is_active", "is_individual")
    search_fields = ("name",)
