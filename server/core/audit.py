"""ثبت گزارش حسابرسی — helper امن (هرگز درخواست را نمی‌شکند)."""
import logging

logger = logging.getLogger(__name__)


def audit(user, action, object_type, object_id=None, details=None):
    """audit(user, 'publish', 'publish_version', version_id, {...})"""
    try:
        from core.models import AuditLog

        real_user = user if getattr(user, 'is_authenticated', False) else None
        AuditLog.objects.create(
            user=real_user,
            action=action,
            object_type=object_type,
            object_id=str(object_id) if object_id is not None else None,
            details=details or {},
        )
    except Exception:
        logger.warning('ثبت گزارش حسابرسی ناموفق بود (action=%s)', action, exc_info=True)
