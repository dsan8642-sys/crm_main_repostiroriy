from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AdminOTPDevice, Consent, ParentAccount, Trainer, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "role", "is_staff")
    list_filter = ("role", "is_staff", "is_active")
    search_fields = ("username", "first_name", "last_name", "email")
    fieldsets = BaseUserAdmin.fieldsets + (("Роль", {"fields": ("role",)}),)


@admin.register(ParentAccount)
class ParentAccountAdmin(admin.ModelAdmin):
    list_display = ("__str__", "phone", "email", "created_at")
    list_filter = ("created_at",)
    search_fields = (
        "user__username", "user__first_name", "user__last_name",
        "phone", "email", "students__first_name", "students__last_name",
    )
    autocomplete_fields = ("user",)


@admin.register(Trainer)
class TrainerAdmin(admin.ModelAdmin):
    list_display = ("__str__", "phone", "is_active")
    list_filter = ("is_active",)
    search_fields = ("user__username", "user__first_name", "user__last_name", "phone")
    autocomplete_fields = ("user",)


@admin.register(Consent)
class ConsentAdmin(admin.ModelAdmin):
    list_display = ("parent", "type", "is_active", "granted_at", "revoked_at")
    list_filter = ("type", "granted")
    search_fields = ("parent__user__first_name", "parent__user__last_name", "parent__phone", "parent__email")
    autocomplete_fields = ("parent",)


@admin.register(AdminOTPDevice)
class AdminOTPDeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "is_confirmed", "created_at", "confirmed_at", "last_used_at")
    list_filter = ("is_confirmed",)
    search_fields = ("user__username", "user__first_name", "user__last_name", "user__email")
    readonly_fields = ("created_at", "confirmed_at", "last_used_at")
    autocomplete_fields = ("user",)
