"""Settings for the automated test suite: fast, isolated, no external services."""
from .base import *  # noqa

DEBUG = False
SECRET_KEY = "test-only-secret-key"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

LOGGING = {"version": 1, "disable_existing_loggers": True}
ENABLE_API_DOCS = True
