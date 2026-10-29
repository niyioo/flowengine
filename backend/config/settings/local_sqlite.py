"""Try FlowEngine on one machine without PostgreSQL: a SQLite file next to manage.py.

    DJANGO_SETTINGS_MODULE=config.settings.local_sqlite python manage.py migrate
"""
from .development import *  # noqa

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "flowengine-local.sqlite3",
    }
}
# The dev server runs on plain http://127.0.0.1.
AUTH_COOKIE = {**AUTH_COOKIE, "SECURE": False}
