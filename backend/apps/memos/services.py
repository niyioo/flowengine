"""
The memo state machine. Every state change goes through these functions, each
in one transaction with the memo row locked, and each writes a MemoAction.

    DRAFT --submit--> IN_REVIEW --approve (last step)--> APPROVED
                         |-- approve --> next step
                         |-- reject  --> REJECTED
                         `-- return  --> RETURNED --resubmit--> IN_REVIEW (from step 1)
    DRAFT / IN_REVIEW / RETURNED --withdraw--> WITHDRAWN
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import UserRole

from .models import (
    EDITABLE_STATUSES,
    OPEN_STATUSES,
    ActionType,
    Memo,
    MemoAction,
    MemoStatus,
    MemoStep,
    ReferenceCounter,
    Route,
    RouteStep,
    StepStatus,
)


def _log(memo, actor, action, *, step_order=None, comment=""):
    return MemoAction.objects.create(memo=memo, actor=actor, action=action, step_order=step_order, comment=comment)


def _locked(memo) -> Memo:
    return Memo.objects.select_for_update().get(pk=memo.pk)


def _next_reference(now) -> str:
    counter, _ = ReferenceCounter.objects.select_for_update().get_or_create(year=now.year)
    counter.last_number += 1
    counter.save(update_fields=["last_number"])
    prefix = settings.PLATFORM_SETTINGS["REFERENCE_PREFIX"]
    return f"{prefix}/{now.year}/{counter.last_number:05d}"


def check_route_usable(route: Route, originator) -> list[RouteStep]:
    if not route.is_active:
        raise ValidationError({"route": "This route is no longer in use. Choose another."})
    steps = list(route.steps.select_related("approver"))
    if not steps:
        raise ValidationError({"route": "This route has no approval steps yet."})
    if any(not s.approver.is_active or s.approver.role == UserRole.AUDITOR for s in steps):
        raise ValidationError({"route": "An approver on this route can no longer approve memos. Ask an administrator to update it."})
    # Separation of duties: nobody approves their own memo.
    if any(s.approver_id == originator.pk for s in steps):
        raise ValidationError({"route": "You are an approver on this route, so you cannot send a memo through it."})
    return steps


def _require_originator(memo, user):
    if memo.originator_id != user.pk:
        raise PermissionDenied("Only the person who raised this memo can do that.")


def _pending_step(memo, user) -> MemoStep:
    if memo.status != MemoStatus.IN_REVIEW:
        raise ValidationError({"detail": "This memo is not awaiting approval."})
    step = memo.steps.select_for_update().get(order=memo.current_step)
    if step.approver_id != user.pk:
        raise PermissionDenied("This memo is waiting on someone else.")
    return step


@transaction.atomic
def create_memo(*, user, title, body, route, priority) -> Memo:
    memo = Memo.objects.create(originator=user, title=title, body=body, route=route, priority=priority)
    _log(memo, user, ActionType.CREATED)
    return memo


@transaction.atomic
def update_memo(memo, *, user, **fields) -> Memo:
    memo = _locked(memo)
    _require_originator(memo, user)
    if memo.status not in EDITABLE_STATUSES:
        raise ValidationError({"detail": "Only drafts and returned memos can be edited."})
    changed = [name for name, value in fields.items() if getattr(memo, name) != value]
    if not changed:
        return memo
    for name in changed:
        setattr(memo, name, fields[name])
    memo.save(update_fields=[*changed, "updated_at"])
    _log(memo, user, ActionType.EDITED)
    return memo


@transaction.atomic
def submit_memo(memo, *, user, comment="") -> Memo:
    """First submission, or resubmission after a return. Review restarts at step 1."""
    memo = _locked(memo)
    _require_originator(memo, user)
    if memo.status not in EDITABLE_STATUSES:
        raise ValidationError({"detail": "This memo has already been submitted."})
    route_steps = check_route_usable(memo.route, user)

    now = timezone.now()
    resubmission = memo.status == MemoStatus.RETURNED
    memo.steps.all().delete()  # earlier attempts stay in the audit trail
    MemoStep.objects.bulk_create([
        MemoStep(
            memo=memo, order=i, title=s.title, approver=s.approver,
            status=StepStatus.PENDING if i == 1 else StepStatus.WAITING,
            received_at=now if i == 1 else None,
        )
        for i, s in enumerate(route_steps, start=1)
    ])
    if not memo.reference:
        memo.reference = _next_reference(now)
    memo.status = MemoStatus.IN_REVIEW
    memo.current_step = 1
    memo.submitted_at = now
    memo.save(update_fields=["reference", "status", "current_step", "submitted_at", "updated_at"])
    _log(memo, user, ActionType.RESUBMITTED if resubmission else ActionType.SUBMITTED, comment=comment)
    return memo


def _close(memo, status, now):
    memo.status = status
    memo.current_step = None
    memo.closed_at = now
    memo.save(update_fields=["status", "current_step", "closed_at", "updated_at"])
    memo.steps.filter(status__in=[StepStatus.WAITING, StepStatus.PENDING]).update(status=StepStatus.SKIPPED)


def _record_decision(step, status, comment, now):
    step.status, step.acted_at, step.comment = status, now, comment
    step.save(update_fields=["status", "acted_at", "comment"])


@transaction.atomic
def approve_memo(memo, *, user, comment="") -> Memo:
    memo = _locked(memo)
    step = _pending_step(memo, user)
    now = timezone.now()
    _record_decision(step, StepStatus.APPROVED, comment, now)
    _log(memo, user, ActionType.APPROVED, step_order=step.order, comment=comment)

    nxt = memo.steps.filter(order__gt=step.order).order_by("order").first()
    if nxt is None:
        _close(memo, MemoStatus.APPROVED, now)
    else:
        nxt.status, nxt.received_at = StepStatus.PENDING, now
        nxt.save(update_fields=["status", "received_at"])
        memo.current_step = nxt.order
        memo.save(update_fields=["current_step", "updated_at"])
    return memo


@transaction.atomic
def return_memo(memo, *, user, comment) -> Memo:
    memo = _locked(memo)
    step = _pending_step(memo, user)
    _record_decision(step, StepStatus.RETURNED, comment, timezone.now())
    memo.status = MemoStatus.RETURNED
    memo.current_step = None
    memo.save(update_fields=["status", "current_step", "updated_at"])
    _log(memo, user, ActionType.RETURNED, step_order=step.order, comment=comment)
    return memo


@transaction.atomic
def reject_memo(memo, *, user, comment) -> Memo:
    memo = _locked(memo)
    step = _pending_step(memo, user)
    now = timezone.now()
    _record_decision(step, StepStatus.REJECTED, comment, now)
    _close(memo, MemoStatus.REJECTED, now)
    _log(memo, user, ActionType.REJECTED, step_order=step.order, comment=comment)
    return memo


@transaction.atomic
def withdraw_memo(memo, *, user, comment="") -> Memo:
    memo = _locked(memo)
    _require_originator(memo, user)
    if memo.status not in OPEN_STATUSES:
        raise ValidationError({"detail": "This memo is already closed."})
    _close(memo, MemoStatus.WITHDRAWN, timezone.now())
    _log(memo, user, ActionType.WITHDRAWN, comment=comment)
    return memo


@transaction.atomic
def comment_on_memo(memo, *, user, comment) -> MemoAction:
    if memo.status == MemoStatus.DRAFT:
        raise ValidationError({"detail": "Drafts are private until submitted."})
    memo.save(update_fields=["updated_at"])
    return _log(memo, user, ActionType.COMMENTED, comment=comment)


@transaction.atomic
def save_route(*, user, name, steps, description="", is_active=True, route=None) -> Route:
    """Create or replace a route and its steps. `steps` is [{title, approver}] in order."""
    if not steps:
        raise ValidationError({"steps": "A route needs at least one approval step."})
    approvers = [s["approver"] for s in steps]
    if len({a.pk for a in approvers}) != len(approvers):
        raise ValidationError({"steps": "Each approver can appear only once on a route."})
    if any(not a.is_active for a in approvers):
        raise ValidationError({"steps": "Approvers must be active users."})
    # Auditors only observe; a step waiting on one could never be completed.
    if any(a.role == UserRole.AUDITOR for a in approvers):
        raise ValidationError({"steps": "Auditors cannot be approvers. Choose a staff member or administrator."})

    if route is None:
        route = Route.objects.create(name=name, description=description, is_active=is_active, created_by=user)
    else:
        route.name, route.description, route.is_active = name, description, is_active
        route.save(update_fields=["name", "description", "is_active", "updated_at"])
        route.steps.all().delete()  # memos in flight keep their own copy of the steps
    RouteStep.objects.bulk_create([
        RouteStep(route=route, order=i, title=s["title"], approver=s["approver"])
        for i, s in enumerate(steps, start=1)
    ])
    return route
