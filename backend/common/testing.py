"""Shared fixtures for the test suite."""
import itertools

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User, UserRole

PASSWORD = "Str0ng-Pass!word"
_counter = itertools.count(1)


def make_user(role=UserRole.STAFF, username=None, **extra):
    n = next(_counter)
    username = username or f"{role.lower()}_{n}"
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=PASSWORD,
        role=role, is_staff=role == UserRole.ADMIN, **extra,
    )


class APITestBase(TestCase):
    """Creates one user per role and an unauthenticated client."""

    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.admin = make_user(UserRole.ADMIN)
        self.staff = make_user(UserRole.STAFF)
        self.auditor = make_user(UserRole.AUDITOR)
        self.client = APIClient()

    def login_as(self, user):
        self.client.force_authenticate(user=user)
        return self.client
