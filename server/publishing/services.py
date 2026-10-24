"""سرویس‌های انتشار: ساخت اسنپ‌شات، نرمال‌سازی زمان‌بندی، به‌روزرسانی وضعیت از گزارش دستگاه."""
from rest_framework.exceptions import ValidationError

from core.notify import notify_dashboard
from library.serializers import ContentSerializer
from playlists.models import Playlist

from .models import RECURRENCE_TYPES, SCHEDULE_TYPES, DEFAULT_SCHEDULE, Deployment
from .serializers import DeploymentSerializer


def build_snapshot(playlist: Playlist) -> dict:
    """اسنپ‌شات ایزوله از برنامه در لحظه انتشار — آیتم‌ها با فراداده کامل محتوا (قرارداد §2.3)."""
    items = []
    for item in playlist.items.select_related('content').order_by('order', 'id'):
        content = item.content
        content_data = ContentSerializer(content).data if content is not None else None
        items.append({
            'order': item.order,
            'content_id': str(content.id) if content else None,
            'content_name': content.name if content else '',
            'type': content.type if content else None,
            'duration_sec': item.duration_sec,
            'mute': item.mute,
            'volume': item.volume,
            'fit_mode': item.fit_mode,
            'background_color': item.background_color,
            'pdf_pages': item.pdf_pages,
            'pdf_seconds_per_page': item.pdf_seconds_per_page,
            'repeat_count': item.repeat_count,
            'text_data': content.text_data if content else None,
            'content': content_data,
        })
    return {'items': items, 'playlist_name': playlist.name}


def normalize_schedule(schedule) -> dict:
    """اعتبارسنجی حداقلی سمت سرور — تصمیم نهایی اجرا با دستگاه است (قرارداد §2.4)."""
    if schedule in (None, ''):
        return {**DEFAULT_SCHEDULE}
    if not isinstance(schedule, dict):
        raise ValidationError({'schedule': ['زمان‌بندی باید یک شیء JSON باشد']})
    schedule_type = schedule.get('type') or 'immediate'
    if schedule_type not in SCHEDULE_TYPES:
        raise ValidationError({'schedule': ['نوع زمان‌بندی نامعتبر است']})
    recurrence = schedule.get('recurrence') or 'none'
    if recurrence not in RECURRENCE_TYPES:
        raise ValidationError({'schedule': ['تکرار نامعتبر است']})
    days = schedule.get('days_of_week')
    if days in (None, ''):
        days = []
    if not isinstance(days, list) or any(not isinstance(d, int) or d < 0 or d > 6 for d in days):
        raise ValidationError({'schedule': ['days_of_week باید آرایه‌ای از اعداد 0..6 باشد']})
    return {
        'type': schedule_type,
        'start_at': schedule.get('start_at'),
        'end_at': schedule.get('end_at'),
        'recurrence': recurrence,
        'days_of_week': days,
        'time_of_day': schedule.get('time_of_day'),
    }


def update_deployment_status(deployment_id, status, progress=None, error=None, device=None):
    """به‌روزرسانی وضعیت Deployment از گزارش دستگاه (devices app).

    - وضعیت‌های پایانی (cancelled/replaced) دیگر تغییر نمی‌کنند.
    - رویداد WebSocket deployment.updated منتشر می‌شود.
    """
    queryset = Deployment.objects.select_related('version', 'device')
    if device is not None:
        queryset = queryset.filter(device=device)
    try:
        deployment = queryset.get(pk=deployment_id)
    except (Deployment.DoesNotExist, ValueError, TypeError):
        return None

    if deployment.status in ('cancelled', 'replaced'):
        return deployment
    if status not in ('downloading', 'ready', 'active', 'playing', 'failed'):
        return deployment

    deployment.status = status
    if progress is not None:
        try:
            deployment.progress = max(0, min(100, int(progress)))
        except (TypeError, ValueError):
            pass
    if error not in (None, ''):
        deployment.error = str(error)[:500]
    elif status == 'failed':
        deployment.error = deployment.error or 'خطای نامشخص دستگاه'
    else:
        deployment.error = None
    if status in ('active', 'playing') and deployment.activated_at is None:
        from django.utils import timezone

        deployment.activated_at = timezone.now()
    deployment.save(update_fields=['status', 'progress', 'error', 'activated_at'])
    notify_dashboard('deployment.updated', DeploymentSerializer(deployment).data)
    return deployment
