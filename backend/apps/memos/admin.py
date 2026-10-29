from django.contrib import admin

from common.admin import ReadOnlyModelAdmin

from .models import Memo, MemoAction, MemoStep, Route, RouteStep


class RouteStepInline(admin.TabularInline):
    model = RouteStep
    extra = 0


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_by", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "description")
    inlines = [RouteStepInline]


class MemoStepInline(admin.TabularInline):
    model = MemoStep
    extra = 0
    can_delete = False
    readonly_fields = ("order", "title", "approver", "status", "received_at", "acted_at", "comment")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Memo)
class MemoAdmin(ReadOnlyModelAdmin):
    """Memos change only through the app, so every change is in the audit trail."""

    list_display = ("reference", "title", "status", "priority", "originator", "updated_at")
    list_filter = ("status", "priority", "route")
    search_fields = ("reference", "title")
    inlines = [MemoStepInline]


@admin.register(MemoAction)
class MemoActionAdmin(ReadOnlyModelAdmin):
    list_display = ("memo", "action", "actor", "step_order", "created_at")
    list_filter = ("action",)
    search_fields = ("memo__reference", "memo__title", "comment")
