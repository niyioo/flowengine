"""
Refresh-token cookie handling.

The browser never sees the refresh token: it lives in an httpOnly,
SameSite=Strict cookie scoped to /api/auth/. The short-lived access token is
returned in the response body and kept only in memory by the SPA.
"""
from django.conf import settings
from rest_framework.exceptions import UnsupportedMediaType
from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.settings import api_settings as jwt_settings


def _cookie():
    return settings.AUTH_COOKIE


def get_refresh_cookie(request):
    return request.COOKIES.get(_cookie()["NAME"])


def set_refresh_cookie(response, token: str):
    cfg = _cookie()
    response.set_cookie(
        cfg["NAME"],
        token,
        max_age=int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds()),
        path=cfg["PATH"],
        secure=cfg["SECURE"],
        httponly=True,
        samesite=cfg["SAMESITE"],
    )


def clear_refresh_cookie(response):
    cfg = _cookie()
    response.delete_cookie(cfg["NAME"], path=cfg["PATH"], samesite=cfg["SAMESITE"])


class RequiresJSONBody(BasePermission):
    """
    CSRF defence for cookie-authenticated endpoints. A cross-site HTML form can
    only send form/multipart/text bodies, never application/json, so requiring
    JSON blocks forged submissions even if SameSite were bypassed.
    """

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if not (request.content_type or "").startswith("application/json"):
            raise UnsupportedMediaType(request.content_type or "none")
        return True
