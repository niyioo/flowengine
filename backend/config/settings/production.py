from decouple import Csv, config

from .base import *  # noqa: F401,F403
from .base import AUTH_COOKIE, LOGGING, MIDDLEWARE, REST_FRAMEWORK

DEBUG = False

# Fail fast: production must never start with a default secret or open hosts.
SECRET_KEY = config("SECRET_KEY")
ALLOWED_HOSTS = config("ALLOWED_HOSTS", cast=Csv())
if SECRET_KEY.startswith("unsafe-") or len(SECRET_KEY) < 50:
    raise RuntimeError("SECRET_KEY must be a random value of at least 50 characters in production.")

# ── HTTPS behind the nginx reverse proxy ──────────────────────────────────────
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = config("SECURE_HSTS_PRELOAD", default=False, cast=bool)

# ── Cookies (used only by the Django admin) ───────────────────────────────────
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_AGE = 60 * 60 * 8  # one shift

AUTH_COOKIE = {**AUTH_COOKIE, "SECURE": True}  # never send the refresh token over HTTP

# ── Headers ──────────────────────────────────────────────────────────────────
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# ── Static files (WhiteNoise, served by Gunicorn behind nginx) ────────────────
MIDDLEWARE = MIDDLEWARE[:2] + ["whitenoise.middleware.WhiteNoiseMiddleware"] + MIDDLEWARE[2:]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ── Cache shared across Gunicorn workers (throttle counters) ─────────────────
# Uses the existing database; create once with `manage.py createcachetable`.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# ── API ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "NUM_PROXIES": config("NUM_PROXIES", default=1, cast=int),
    # Browsable API is a debugging aid; JSON only in production.
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

# ── Logging: containers log to stdout; optionally also to a file ─────────────
LOG_FILE = config("LOG_FILE", default="")
if LOG_FILE:
    LOGGING["handlers"]["file"] = {
        "class": "logging.handlers.RotatingFileHandler",
        "filename": LOG_FILE,
        "maxBytes": 10 * 1024 * 1024,
        "backupCount": 5,
        "formatter": "standard",
    }
    for logger_name in ("apps", "common"):
        LOGGING["loggers"][logger_name]["handlers"].append("file")
    LOGGING["root"]["handlers"].append("file")
