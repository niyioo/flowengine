from django.conf import settings
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserRole
from common.permissions import IsAdminOrReadOnly, IsAnyRole, RolePermission

from . import selectors, services
from .models import MemoAction, MemoPriority, MemoStatus, Route
from .serializers import (
    MemoDetailSerializer,
    MemoListSerializer,
    MemoWriteSerializer,
    OptionalCommentSerializer,
    RequiredCommentSerializer,
    RouteSerializer,
    RouteWriteSerializer,
)

BOXES = ("inbox", "mine", "all")


class CanRaiseMemos(RolePermission):
    """Everyone may read what they can see; auditors cannot create or act."""

    roles = frozenset({UserRole.ADMIN, UserRole.STAFF})

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return IsAnyRole().has_permission(request, view)
        return super().has_permission(request, view)


class MemoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                  mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    GET  /api/memos/?box=inbox|mine|all&status=&priority=&search=
    POST /api/memos/                      create a draft
    PATCH /api/memos/{id}/                edit a draft or returned memo
    POST /api/memos/{id}/submit|approve|return|reject|withdraw|comment/
    """

    permission_classes = [CanRaiseMemos]
    filterset_fields = ["status", "priority"]
    search_fields = ["reference", "title", "body"]
    ordering_fields = ["updated_at", "submitted_at", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        box = self.request.query_params.get("box", "all")
        if self.action == "list" and box not in BOXES:
            raise ValidationError({"box": f"Use one of: {', '.join(BOXES)}."})
        if self.action == "list" and box == "inbox":
            qs = selectors.inbox(user)
        elif self.action == "list" and box == "mine":
            qs = selectors.visible_memos(user).filter(originator=user)
        else:
            qs = selectors.visible_memos(user)
        qs = selectors.with_current_step(qs)
        if self.action == "retrieve":
            qs = qs.prefetch_related(Prefetch("actions", queryset=MemoAction.objects.select_related("actor")))
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return MemoWriteSerializer
        if self.action == "list":
            return MemoListSerializer
        return MemoDetailSerializer

    def _detail(self, memo, code=status.HTTP_200_OK):
        memo = self.get_queryset().get(pk=memo.pk)
        return Response(MemoDetailSerializer(memo, context=self.get_serializer_context()).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = MemoWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        memo = services.create_memo(user=request.user, **serializer.validated_data)
        return self._detail(memo, status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        memo = self.get_object()
        serializer = MemoWriteSerializer(memo, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        memo = services.update_memo(memo, user=request.user, **serializer.validated_data)
        return self._detail(memo)

    def _act(self, request, service, payload_serializer):
        memo = self.get_object()
        payload = payload_serializer(data=request.data)
        payload.is_valid(raise_exception=True)
        service(memo, user=request.user, comment=payload.validated_data.get("comment", ""))
        return self._detail(memo)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        return self._act(request, services.submit_memo, OptionalCommentSerializer)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._act(request, services.approve_memo, OptionalCommentSerializer)

    @action(detail=True, methods=["post"], url_path="return")
    def return_for_changes(self, request, pk=None):
        return self._act(request, services.return_memo, RequiredCommentSerializer)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._act(request, services.reject_memo, RequiredCommentSerializer)

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        return self._act(request, services.withdraw_memo, OptionalCommentSerializer)

    @action(detail=True, methods=["post"], permission_classes=[IsAnyRole])
    def comment(self, request, pk=None):
        # Auditors may comment (ask a question) but never change a memo's state.
        return self._act(request, services.comment_on_memo, RequiredCommentSerializer)


class RouteViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Approval routes. Everyone can read active routes; admins manage them. Never deleted."""

    permission_classes = [IsAdminOrReadOnly]
    search_fields = ["name", "description"]
    http_method_names = ["get", "post", "put", "head", "options"]
    pagination_class = None

    def get_queryset(self):
        qs = Route.objects.prefetch_related("steps__approver")
        include_inactive = self.request.query_params.get("include_inactive") == "true"
        if not (include_inactive and self.request.user.role == UserRole.ADMIN):
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return RouteWriteSerializer if self.action in ("create", "update") else RouteSerializer

    def _save(self, request, route=None):
        serializer = RouteWriteSerializer(route, data=request.data)
        serializer.is_valid(raise_exception=True)
        route = services.save_route(user=request.user, route=route, **serializer.validated_data)
        route = Route.objects.prefetch_related("steps__approver").get(pk=route.pk)
        return RouteSerializer(route).data

    def create(self, request, *args, **kwargs):
        return Response(self._save(request), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(self._save(request, self.get_object()))


class DashboardView(APIView):
    permission_classes = [IsAnyRole]

    def get(self, request):
        data = selectors.dashboard(request.user)
        recent = selectors.with_current_step(selectors.inbox(request.user).order_by("submitted_at"))
        limit = settings.PLATFORM_SETTINGS["DASHBOARD_LIST_LIMIT"]
        data["inbox"] = MemoListSerializer(recent[:limit], many=True).data
        mine = selectors.with_current_step(
            selectors.visible_memos(request.user).filter(originator=request.user).order_by("-updated_at")
        )
        data["recent_mine"] = MemoListSerializer(mine[:limit], many=True).data
        return Response(data)


class PlatformConfigView(APIView):
    """Settings the UI needs, so limits and labels are never hard-coded in the browser."""

    permission_classes = [IsAnyRole]

    def get(self, request):
        limits = settings.PLATFORM_SETTINGS
        return Response({
            "server_time": timezone.now(),
            "live_refresh_seconds": limits["LIVE_REFRESH_SECONDS"],
            "step_target_days": limits["STEP_TARGET_DAYS"],
            "dashboard_window_days": limits["DASHBOARD_WINDOW_DAYS"],
            "limits": {
                "comment_min_length": limits["COMMENT_MIN_LENGTH"],
                "comment_max_length": limits["COMMENT_MAX_LENGTH"],
                "memo_body_max_length": limits["MEMO_BODY_MAX_LENGTH"],
                "max_route_steps": limits["MAX_ROUTE_STEPS"],
                "password_min_length": _password_min_length(),
            },
            "statuses": [{"value": v, "label": l} for v, l in MemoStatus.choices],
            "priorities": [{"value": v, "label": l} for v, l in MemoPriority.choices],
            "roles": [{"value": v, "label": l} for v, l in UserRole.choices],
        })


def _password_min_length() -> int:
    for validator in settings.AUTH_PASSWORD_VALIDATORS:
        if validator["NAME"].endswith("MinimumLengthValidator"):
            return validator.get("OPTIONS", {}).get("min_length", 8)
    return 0
