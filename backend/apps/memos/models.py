"""
Memos and the routes they travel.

A Route is a reusable approval chain (e.g. Unit Head → Director → DG). When a
memo is submitted, the route's steps are copied onto the memo as MemoSteps, so
editing a route later never changes a memo that is already in flight.
Every change of state is recorded in MemoAction, which is append-only.
"""
import uuid

from django.conf import settings
from django.db import models

from common.mixins import TimeStampedModelMixin


class Route(TimeStampedModelMixin):
    name = models.CharField(max_length=120, unique=True)
    description = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class RouteStep(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=120)
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["route", "order"]
        constraints = [
            models.UniqueConstraint(fields=["route", "order"], name="unique_route_step_order"),
        ]

    def __str__(self) -> str:
        return f"{self.route} #{self.order}: {self.title}"


class MemoStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    IN_REVIEW = "IN_REVIEW", "In review"
    RETURNED = "RETURNED", "Returned for changes"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    WITHDRAWN = "WITHDRAWN", "Withdrawn"


OPEN_STATUSES = (MemoStatus.DRAFT, MemoStatus.IN_REVIEW, MemoStatus.RETURNED)
CLOSED_STATUSES = (MemoStatus.APPROVED, MemoStatus.REJECTED, MemoStatus.WITHDRAWN)
EDITABLE_STATUSES = (MemoStatus.DRAFT, MemoStatus.RETURNED)


class MemoPriority(models.TextChoices):
    NORMAL = "NORMAL", "Normal"
    URGENT = "URGENT", "Urgent"


class Memo(TimeStampedModelMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Human reference, e.g. FE/2026/00042. Assigned on first submission.
    reference = models.CharField(max_length=32, unique=True, null=True, blank=True)
    title = models.CharField(max_length=200)
    body = models.TextField()
    priority = models.CharField(max_length=10, choices=MemoPriority.choices, default=MemoPriority.NORMAL)
    originator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memos")
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="memos")
    status = models.CharField(max_length=12, choices=MemoStatus.choices, default=MemoStatus.DRAFT)
    # Order of the step currently awaiting action; null when no step is pending.
    current_step = models.PositiveSmallIntegerField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["status", "updated_at"])]

    def __str__(self) -> str:
        return f"{self.reference or 'Draft'}: {self.title}"


class StepStatus(models.TextChoices):
    WAITING = "WAITING", "Waiting"
    PENDING = "PENDING", "Awaiting action"
    APPROVED = "APPROVED", "Approved"
    RETURNED = "RETURNED", "Returned"
    REJECTED = "REJECTED", "Rejected"
    SKIPPED = "SKIPPED", "Not reached"


class MemoStep(models.Model):
    memo = models.ForeignKey(Memo, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=120)
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memo_steps")
    status = models.CharField(max_length=10, choices=StepStatus.choices, default=StepStatus.WAITING)
    # When this step started waiting on the approver, and when they acted.
    received_at = models.DateTimeField(null=True, blank=True)
    acted_at = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)

    class Meta:
        ordering = ["memo", "order"]
        constraints = [
            models.UniqueConstraint(fields=["memo", "order"], name="unique_memo_step_order"),
        ]

    def __str__(self) -> str:
        return f"{self.memo} #{self.order}: {self.status}"


class ActionType(models.TextChoices):
    CREATED = "CREATED", "Created"
    EDITED = "EDITED", "Edited"
    SUBMITTED = "SUBMITTED", "Submitted"
    RESUBMITTED = "RESUBMITTED", "Resubmitted"
    APPROVED = "APPROVED", "Approved"
    RETURNED = "RETURNED", "Returned for changes"
    REJECTED = "REJECTED", "Rejected"
    WITHDRAWN = "WITHDRAWN", "Withdrawn"
    COMMENTED = "COMMENTED", "Commented"


class MemoAction(models.Model):
    """Append-only audit trail. Written only by apps.memos.services."""

    memo = models.ForeignKey(Memo, on_delete=models.CASCADE, related_name="actions")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=12, choices=ActionType.choices)
    step_order = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.memo} · {self.action} by {self.actor}"


class ReferenceCounter(models.Model):
    """Last memo number issued per year; locked while a reference is assigned."""

    year = models.PositiveSmallIntegerField(primary_key=True)
    last_number = models.PositiveIntegerField(default=0)
