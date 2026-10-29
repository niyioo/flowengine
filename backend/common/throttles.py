from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Limits failed-login brute force per (username, client IP).

    Keying on the username as well as the IP matters here: office staff usually
    share one public IP, so an IP-only limit would let one person lock out the
    whole shift. `LoginIPRateThrottle` below provides the coarse per-IP ceiling.
    """

    scope = "login"

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "")).strip().lower()[:150]
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{self.get_ident(request)}:{username}",
        }


class LoginIPRateThrottle(AnonRateThrottle):
    scope = "login_ip"


class TokenRefreshRateThrottle(AnonRateThrottle):
    scope = "token_refresh"
