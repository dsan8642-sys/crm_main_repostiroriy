from django.contrib import admin

from audit.mixins import AuditAdminMixin
from billing.services import charge_statuses, student_balance

from .models import GroupMembership, Student


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 0
    autocomplete_fields = ("group",)
    max_num = 3


class DebtFilter(admin.SimpleListFilter):
    title = "Задолженность"
    parameter_name = "debt"

    def lookups(self, request, model_admin):
        return (
            ("yes", "Есть долг / просрочка"),
            ("no", "Без долга"),
        )

    def queryset(self, request, queryset):
        if self.value() not in {"yes", "no"}:
            return queryset

        matched_ids = []
        for student in queryset:
            has_debt = (
                student_balance(student).amount_minor > 0
                or any(status.is_overdue for status in charge_statuses(student))
            )
            if (self.value() == "yes" and has_debt) or (self.value() == "no" and not has_debt):
                matched_ids.append(student.pk)
        return queryset.filter(pk__in=matched_ids)


@admin.register(Student)
class StudentAdmin(AuditAdminMixin, admin.ModelAdmin):
    audit_action_prefix = "client"  # 5.12: "кто создал клиента"
    list_display = (
        "full_name", "parent", "parent_phone", "email", "groups_display",
        "group_trainer", "is_account_holder", "is_active")
    list_filter = ("is_active", "is_account_holder", DebtFilter, "groups", "groups__default_trainer")
    search_fields = (
        "first_name", "last_name", "email",
        "parent__phone", "parent__email",
        "parent__user__first_name", "parent__user__last_name",
        "groups__name", "groups__default_trainer__user__first_name",
        "groups__default_trainer__user__last_name",
    )
    autocomplete_fields = ("parent",)
    inlines = (GroupMembershipInline,)
    fieldsets = (
        (None, {"fields": ("parent", "first_name", "last_name", "birth_date",
                           "email", "is_account_holder", "is_active")}),
        ("Медицинская информация (критично)", {
            "fields": ("medical_info", "contraindications",
                       "emergency_contact_name", "emergency_contact_phone")}),
        ("Служебное", {"fields": ("admin_comments",)}),
    )

    @admin.display(description="Телефон")
    def parent_phone(self, obj):
        return obj.parent.phone

    @admin.display(description="Группы")
    def groups_display(self, obj):
        return ", ".join(obj.groups.values_list("name", flat=True)) or "—"

    @admin.display(description="Тренер")
    def group_trainer(self, obj):
        return ", ".join(
            str(trainer) for trainer in {
                group.default_trainer for group in obj.groups.select_related("default_trainer__user")
                if group.default_trainer_id
            }) or None

    def has_delete_permission(self, request, obj=None):
        return False
