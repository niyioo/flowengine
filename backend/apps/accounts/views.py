import logging

from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotAuthenticated
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from common.throttles import LoginIPRateThrottle, LoginRateThrottle, TokenRefreshRateThrottle

from .auth_cookies import RequiresJSONBody, clear_refresh_cookie, get_refresh_cookie, set_refresh_cookie
from .models import User, UserRole
from .permissions import IsAdminUserRole
from .serializers import UserCreateSerializer, UserSerializer, UserUpdateSerializer

logger = logging.getLogger(__name__)


def revoke_all_refresh_tokens(user) -> int:
    """Blacklist every outstanding refresh token of `user` (forces re-login everywhere)."""
    tokens = OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False)
    count = 0
    for token in tokens:
        BlacklistedToken.objects.get_or_create(token=token)
        count += 1
    return count


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LoginView(TokenObtainPairView):
    """
    POST {username, password} → {access}. The refresh token is set as an
    httpOnly cookie and deliberately left out of the response body.
    """

    throttle_classes = [LoginRateThrottle, LoginIPRateThrottle]
    parser_classes = [JSONParser]
    permission_classes = [RequiresJSONBody]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            set_refresh_cookie(response, response.data.pop("refresh"))
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """POST {} with the refresh cookie → {access}. Rotates the cookie."""

    throttle_classes = [TokenRefreshRateThrottle]
    parser_classes = [JSONParser]
    permission_classes = [RequiresJSONBody]

    def post(self, request, *args, **kwargs):
        token = get_refresh_cookie(request)
        if not token:
            return self.handle_exception(NotAuthenticated("No active session. Please sign in.", code="no_session"))

        serializer = self.get_serializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken) as exc:
            error = exc if isinstance(exc, InvalidToken) else InvalidToken(exc.args[0])
            response = self.handle_exception(error)
            clear_refresh_cookie(response)  # a dead cookie should not be resent
            return response

        data = dict(serializer.validated_data)
        response = Response({"access": data["access"]}, status=status.HTTP_200_OK)
        if "refresh" in data:
            set_refresh_cookie(response, data["refresh"])
        return response


class LogoutView(APIView):
    """
    Revokes the session held in the refresh cookie and clears it. The cookie is
    the credential, so this works even after the in-memory access token is gone.
    Idempotent: always 200.
    """

    authentication_classes = []
    permission_classes = [RequiresJSONBody]
    throttle_classes = [TokenRefreshRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request):
        token = get_refresh_cookie(request)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError as exc:
                logger.info("Logout with unusable refresh token: %s", exc)
        response = Response({"detail": "Signed out."}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        return response


class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.all().order_by("-created_at")
    permission_classes = [IsAdminUserRole]
    filterset_fields = ["role", "is_active", "department"]
    search_fields = ["username", "email", "first_name", "last_name", "designation", "department"]
    ordering_fields = ["created_at", "username", "email", "first_name"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        logger.info("Admin %s created user %s (%s)", self.request.user.username, user.username, user.role)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    DELETE deactivates instead of deleting: users are referenced (PROTECT) by
    memos, approval steps and the audit trail, which must keep their author.
    """

    queryset = User.objects.all()
    permission_classes = [IsAdminUserRole]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return UserUpdateSerializer
        return UserSerializer

    @transaction.atomic
    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        user = serializer.save()
        if was_active and not user.is_active:
            revoked = revoke_all_refresh_tokens(user)
            logger.info("Admin %s deactivated %s (%d sessions revoked)", self.request.user.username, user.username, revoked)
        else:
            logger.info("Admin %s updated user %s", self.request.user.username, user.username)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance == request.user:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if instance.role == UserRole.ADMIN and instance.is_active and not User.objects.filter(
            role=UserRole.ADMIN, is_active=True
        ).exclude(pk=instance.pk).exists():
            return Response(
                {"detail": "At least one active administrator must remain."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        revoked = revoke_all_refresh_tokens(instance)
        logger.info("Admin %s deactivated %s (%d sessions revoked)", request.user.username, instance.username, revoked)
        return Response(status=status.HTTP_204_NO_CONTENT)
