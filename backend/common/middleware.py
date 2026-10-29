import logging

from django.db import connection
from django.http import JsonResponse

logger = logging.getLogger(__name__)

HEALTH_PATH = "/health/"


class HealthCheckMiddleware:
    """
    Answers container/load-balancer probes before any other middleware runs.

    Probes hit the container directly (Host: localhost, plain HTTP), which would
    otherwise be rejected by ALLOWED_HOSTS or redirected by SECURE_SSL_REDIRECT.
    Must be first in MIDDLEWARE.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != HEALTH_PATH or request.method not in ("GET", "HEAD"):
            return self.get_response(request)

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_ok = True
        except Exception:  # noqa: BLE001 — any DB failure means "not ready"
            logger.exception("Health check: database unavailable")
            db_ok = False

        return JsonResponse(
            {"status": "ok" if db_ok else "degraded", "db": "connected" if db_ok else "unavailable"},
            status=200 if db_ok else 503,
        )
