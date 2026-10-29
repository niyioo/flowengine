from django.contrib import admin


class ReadOnlyAdminMixin:
    """
    For records that must only change through the service layer (so stock
    stays in sync with the ledger). Visible in the admin for audit, never editable.
    """

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions


class ReadOnlyModelAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    pass
