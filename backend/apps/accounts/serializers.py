from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.utils import datetime_from_epoch

from .models import User, UserRole


def check_password_policy(password, user):
    """Run Django's password validators, reporting failures against the password field."""
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"password": list(exc.messages)}) from exc


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Embeds user role and display name into the token payload (informational only —
    authorisation is always decided from the database, never from token claims)."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token


class ActiveUserTokenRefreshSerializer(TokenRefreshSerializer):
    """Refuses to rotate refresh tokens for users that were deactivated or deleted."""

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        user_id = refresh.payload.get(jwt_settings.USER_ID_CLAIM)
        UserModel = get_user_model()
        user = UserModel.objects.filter(**{jwt_settings.USER_ID_FIELD: user_id, "is_active": True}).first()
        if user is None:
            raise InvalidToken("User account is disabled or no longer exists.")

        data = super().validate(attrs)

        # simplejwt 5.3 does not record rotated tokens as outstanding, which would
        # let them escape a "revoke all sessions" sweep. Record them explicitly.
        if "refresh" in data:
            new_refresh = self.token_class(data["refresh"])
            OutstandingToken.objects.get_or_create(
                jti=new_refresh[jwt_settings.JTI_CLAIM],
                defaults={
                    "user": user,
                    "token": data["refresh"],
                    "created_at": new_refresh.current_time,
                    "expires_at": datetime_from_epoch(new_refresh["exp"]),
                },
            )
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "full_name", "role", "designation", "department",
            "is_active", "is_superuser", "last_login", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "designation", "department", "password", "is_active",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {"email": {"required": True, "allow_blank": False}}

    def validate(self, attrs):
        candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
        check_password_policy(attrs["password"], candidate)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.is_staff = user.role == UserRole.ADMIN
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})

    class Meta:
        model = User
        fields = [
            "username", "email", "first_name", "last_name",
            "role", "designation", "department", "password", "is_active",
        ]

    def validate(self, attrs):
        request = self.context["request"]
        instance = self.instance
        new_role = attrs.get("role", instance.role)
        new_active = attrs.get("is_active", instance.is_active)

        if instance == request.user:
            if new_role != instance.role:
                raise serializers.ValidationError({"role": "You cannot change your own role."})
            if not new_active:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})

        losing_admin = instance.role == UserRole.ADMIN and instance.is_active and (
            new_role != UserRole.ADMIN or not new_active
        )
        if losing_admin:
            other_admins = User.objects.filter(role=UserRole.ADMIN, is_active=True).exclude(pk=instance.pk)
            if not other_admins.exists():
                raise serializers.ValidationError("At least one active administrator must remain.")

        if attrs.get("password"):
            check_password_policy(attrs["password"], instance)
        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.is_staff = instance.role == UserRole.ADMIN

        if password:
            instance.set_password(password)

        instance.save()
        return instance
