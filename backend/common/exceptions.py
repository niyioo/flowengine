import logging

from django.db import IntegrityError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class BusinessLogicError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "A business logic error occurred."
    default_code = "business_logic_error"


class InsufficientStockError(BusinessLogicError):
    default_detail = "Insufficient stock to complete the operation."
    default_code = "insufficient_stock"


class DuplicateEntryError(BusinessLogicError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "A record for this date already exists."
    default_code = "duplicate_entry"


class InvalidDateRangeError(BusinessLogicError):
    default_detail = "The supplied date range is invalid."
    default_code = "invalid_date_range"


class AlreadyVoidedError(BusinessLogicError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This record has already been voided."
    default_code = "already_voided"


def _first_message(errors):
    """Return the first human-readable message from a DRF error structure."""
    if isinstance(errors, dict):
        for value in errors.values():
            message = _first_message(value)
            if message:
                return message
    elif isinstance(errors, (list, tuple)):
        for value in errors:
            message = _first_message(value)
            if message:
                return message
    elif errors:
        return str(errors)
    return None


def _error_code(detail, exc):
    code = getattr(detail, "code", None)
    return code or getattr(exc, "default_code", "error")


def custom_exception_handler(exc, context):
    """
    Wraps every API error in one envelope so clients can rely on its shape:
    { "error": true, "status_code": int, "code": str, "detail": str, "errors": {...}? }
    `detail` is always a human-readable sentence; `errors` carries field-level detail.
    """
    if isinstance(exc, ProtectedError):
        exc = DuplicateEntryError(
            "This record is referenced by other records and cannot be deleted.",
            code="protected",
        )
    elif isinstance(exc, IntegrityError):
        logger.warning("Integrity error in %s: %s", context.get("view"), exc)
        exc = DuplicateEntryError(
            "The operation conflicts with existing data.", code="integrity_error"
        )

    response = exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled exception in %s", context.get("view"), exc_info=exc)
        return Response(
            {
                "error": True,
                "status_code": 500,
                "code": "server_error",
                "detail": "An unexpected error occurred. Please try again or contact support.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    payload = {"error": True, "status_code": response.status_code}

    if isinstance(data, dict) and set(data.keys()) <= {"detail", "code"} and "detail" in data:
        payload["detail"] = str(data["detail"])
        payload["code"] = _error_code(data["detail"], exc)
    elif isinstance(data, (dict, list)):
        payload["detail"] = _first_message(data) or "Validation failed."
        payload["code"] = "validation_error"
        payload["errors"] = data if isinstance(data, dict) else {"non_field_errors": data}
    else:
        payload["detail"] = str(data)
        payload["code"] = getattr(exc, "default_code", "error")

    response.data = payload
    return response
