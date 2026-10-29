import uuid
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    STAFF = "STAFF", "Staff"
    AUDITOR = "AUDITOR", "Auditor"


class FlowEngineUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # A superuser has full Django-admin access, so their application role must match.
        extra_fields.setdefault("role", UserRole.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.STAFF)
    # Shown on memos and approval steps, e.g. "Director" of "Finance & Accounts".
    designation = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = FlowEngineUserManager()

    REQUIRED_FIELDS = ["email"]

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.username

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
