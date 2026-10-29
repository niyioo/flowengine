"""Read-side queries: who can see which memos, the inbox, and dashboard figures."""
from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count, ExpressionWrapper, F, DurationField, Q
from django.utils import timezone

from apps.accounts.models import UserRole

from .models import CLOSED_STATUSES, Memo, MemoStatus, MemoStep, StepStatus

OVERSIGHT_ROLES = (UserRole.ADMIN, UserRole.AUDITOR)


def visible_memos(user):
    """
    Originators see their own memos; approvers see memos routed through them;
    admins and auditors see every submitted memo. Drafts stay private to their author.
    """
    qs = Memo.objects.select_related("originator", "route")
    if user.role in OVERSIGHT_ROLES:
        return qs.filter(Q(originator=user) | ~Q(status=MemoStatus.DRAFT))
    routed_to_me = MemoStep.objects.filter(approver=user).values("memo_id")
    return qs.filter(Q(originator=user) | (Q(pk__in=routed_to_me) & ~Q(status=MemoStatus.DRAFT)))


def inbox(user):
    """Memos whose current step is waiting on `user`."""
    pending = MemoStep.objects.filter(approver=user, status=StepStatus.PENDING).values("memo_id")
    return visible_memos(user).filter(status=MemoStatus.IN_REVIEW, pk__in=pending)


def with_current_step(qs):
    return qs.prefetch_related("steps__approver")


def step_target_days() -> int:
    return settings.PLATFORM_SETTINGS["STEP_TARGET_DAYS"]


def dashboard(user) -> dict:
    now = timezone.now()
    window_days = settings.PLATFORM_SETTINGS["DASHBOARD_WINDOW_DAYS"]
    since = now - timedelta(days=window_days)
    overdue_before = now - timedelta(days=step_target_days())

    mine = Memo.objects.filter(originator=user)
    my_pending_steps = MemoStep.objects.filter(approver=user, status=StepStatus.PENDING, memo__status=MemoStatus.IN_REVIEW)
    closed = visible_memos(user).filter(status__in=CLOSED_STATUSES, closed_at__gte=since)
    turnaround = (
        closed.filter(status=MemoStatus.APPROVED, submitted_at__isnull=False)
        .annotate(took=ExpressionWrapper(F("closed_at") - F("submitted_at"), output_field=DurationField()))
        .aggregate(avg=Avg("took"))["avg"]
    )
    closed_counts = dict(closed.values_list("status").annotate(n=Count("pk")).values_list("status", "n"))

    oversight = None
    if user.role in OVERSIGHT_ROLES:
        pending = MemoStep.objects.filter(status=StepStatus.PENDING, memo__status=MemoStatus.IN_REVIEW)
        oversight = {
            "in_review": Memo.objects.filter(status=MemoStatus.IN_REVIEW).count(),
            "overdue_steps": pending.filter(received_at__lt=overdue_before).count(),
            "returned": Memo.objects.filter(status=MemoStatus.RETURNED).count(),
        }

    return {
        "oversight": oversight,
        "window_days": window_days,
        "step_target_days": step_target_days(),
        "awaiting_me": my_pending_steps.count(),
        "awaiting_me_overdue": my_pending_steps.filter(received_at__lt=overdue_before).count(),
        "my_in_review": mine.filter(status=MemoStatus.IN_REVIEW).count(),
        "my_returned": mine.filter(status=MemoStatus.RETURNED).count(),
        "my_drafts": mine.filter(status=MemoStatus.DRAFT).count(),
        "closed": {
            "approved": closed_counts.get(MemoStatus.APPROVED, 0),
            "rejected": closed_counts.get(MemoStatus.REJECTED, 0),
            "withdrawn": closed_counts.get(MemoStatus.WITHDRAWN, 0),
        },
        "avg_approval_hours": round(turnaround.total_seconds() / 3600, 1) if turnaround else None,
    }
