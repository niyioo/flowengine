from django.conf import settings
from rest_framework import serializers


def comment_field(required=True):
    limits = settings.PLATFORM_SETTINGS
    kwargs = {"min_length": limits["COMMENT_MIN_LENGTH"]} if required else {"allow_blank": True, "required": False}
    return serializers.CharField(max_length=limits["COMMENT_MAX_LENGTH"], trim_whitespace=True, **kwargs)
