from decimal import Decimal
from django.core.exceptions import ValidationError


def validate_non_negative_decimal(value: Decimal) -> None:
    if value < 0:
        raise ValidationError("Value cannot be negative.")


def validate_non_negative_integer(value: int) -> None:
    if value < 0:
        raise ValidationError("Value cannot be negative.")