from django.conf import settings
from rest_framework import serializers

from apps.accounts.models import User
from common.serializers import comment_field

from .models import EDITABLE_STATUSES, OPEN_STATUSES, Memo, MemoAction, MemoPriority, MemoStatus, MemoStep, Route


class PersonSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "name", "designation", "department"]
        read_only_fields = fields


# ── Routes ─────────────────────────────────────────────────────────────────

class RouteStepReadSerializer(serializers.Serializer):
    order = serializers.IntegerField()
    title = serializers.CharField()
    approver = PersonSerializer()


class RouteStepWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, trim_whitespace=True)
    approver = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))


class RouteSerializer(serializers.ModelSerializer):
    steps = RouteStepReadSerializer(many=True, read_only=True)

    class Meta:
        model = Route
        fields = ["id", "name", "description", "is_active", "steps", "created_at", "updated_at"]
        read_only_fields = fields


class RouteWriteSerializer(serializers.ModelSerializer):
    steps = RouteStepWriteSerializer(many=True)

    class Meta:
        model = Route
        fields = ["name", "description", "is_active", "steps"]

    def validate_steps(self, steps):
        limit = settings.PLATFORM_SETTINGS["MAX_ROUTE_STEPS"]
        if len(steps) > limit:
            raise serializers.ValidationError(f"A route can have at most {limit} steps.")
        return steps


# ── Memos ──────────────────────────────────────────────────────────────────

class MemoStepSerializer(serializers.ModelSerializer):
    approver = PersonSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = MemoStep
        fields = ["order", "title", "approver", "status", "status_label", "received_at", "acted_at", "comment"]
        read_only_fields = fields


class MemoActionSerializer(serializers.ModelSerializer):
    actor = PersonSerializer(read_only=True)
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = MemoAction
        fields = ["id", "actor", "action", "action_label", "step_order", "comment", "created_at"]
        read_only_fields = fields


def _current_step(memo):
    if memo.current_step is None:
        return None
    # Uses the prefetched steps, so listing memos stays one query per relation.
    return next((s for s in memo.steps.all() if s.order == memo.current_step), None)


class MemoListSerializer(serializers.ModelSerializer):
    originator = PersonSerializer(read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    current_step = serializers.SerializerMethodField()
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = Memo
        fields = [
            "id", "reference", "title", "priority", "status", "status_label",
            "originator", "route_name", "current_step", "step_count",
            "submitted_at", "closed_at", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_current_step(self, memo):
        step = _current_step(memo)
        if step is None:
            return None
        return {
            "order": step.order, "title": step.title,
            "approver": PersonSerializer(step.approver).data, "received_at": step.received_at,
        }

    def get_step_count(self, memo):
        return len(memo.steps.all())


class MemoDetailSerializer(MemoListSerializer):
    route = serializers.PrimaryKeyRelatedField(read_only=True)
    steps = MemoStepSerializer(many=True, read_only=True)
    actions = MemoActionSerializer(many=True, read_only=True)
    allowed = serializers.SerializerMethodField()

    class Meta(MemoListSerializer.Meta):
        fields = MemoListSerializer.Meta.fields + ["body", "route", "steps", "actions", "allowed"]
        read_only_fields = fields

    def get_allowed(self, memo):
        """What the current user may do, so the UI shows only valid actions."""
        user = self.context["request"].user
        is_originator = memo.originator_id == user.pk
        step = _current_step(memo)
        is_approver = bool(step and memo.status == MemoStatus.IN_REVIEW and step.approver_id == user.pk)
        return {
            "edit": is_originator and memo.status in EDITABLE_STATUSES,
            "submit": is_originator and memo.status in EDITABLE_STATUSES,
            "withdraw": is_originator and memo.status in OPEN_STATUSES,
            "decide": is_approver,
            "comment": memo.status != MemoStatus.DRAFT,
        }


class MemoWriteSerializer(serializers.ModelSerializer):
    route = serializers.PrimaryKeyRelatedField(queryset=Route.objects.filter(is_active=True))
    priority = serializers.ChoiceField(choices=MemoPriority.choices, default=MemoPriority.NORMAL)

    class Meta:
        model = Memo
        fields = ["title", "body", "priority", "route"]

    def validate_body(self, value):
        limit = settings.PLATFORM_SETTINGS["MEMO_BODY_MAX_LENGTH"]
        if len(value) > limit:
            raise serializers.ValidationError(f"Keep the memo under {limit} characters.")
        return value


class OptionalCommentSerializer(serializers.Serializer):
    comment = comment_field(required=False)


class RequiredCommentSerializer(serializers.Serializer):
    comment = comment_field(required=True)
