from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError


class Conflict(APIException):
    """۴۰۹ — تداخل در وضعیت (مثلاً حذف محتوای درحال‌استفاده)."""

    status_code = 409
    default_detail = 'تداخل در وضعیت'
    default_code = 'conflict'


class ValidationError(DRFValidationError):
    """۴۰۰ — همان ValidationError درافریم (برای پیام‌های فارسی)."""
