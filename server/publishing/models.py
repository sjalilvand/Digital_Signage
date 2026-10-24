"""مدل‌های انتشار: PublishVersion (تغییرناپذیر) و Deployment (قرارداد §2.3 و §2.4)."""
import uuid

from django.db import models

PRIORITY_NORMAL = 'normal'
PRIORITY_HIGH = 'high'
PRIORITY_CHOICES = [(PRIORITY_NORMAL, 'عادی'), (PRIORITY_HIGH, 'فوری')]

STATUS_PENDING_CONNECTION = 'pending_connection'
STATUS_DOWNLOADING = 'downloading'
STATUS_READY = 'ready'
STATUS_ACTIVE = 'active'
STATUS_PLAYING = 'playing'
STATUS_FAILED = 'failed'
STATUS_CANCELLED = 'cancelled'
STATUS_REPLACED = 'replaced'
DEPLOYMENT_STATUSES = [
    STATUS_PENDING_CONNECTION,
    STATUS_DOWNLOADING,
    STATUS_READY,
    STATUS_ACTIVE,
    STATUS_PLAYING,
    STATUS_FAILED,
    STATUS_CANCELLED,
    STATUS_REPLACED,
]
TERMINAL_STATUSES = [STATUS_CANCELLED, STATUS_REPLACED]
NON_TERMINAL_STATUSES = [s for s in DEPLOYMENT_STATUSES if s not in TERMINAL_STATUSES]

SCHEDULE_TYPES = ['immediate', 'scheduled', 'recurring', 'expiry']
RECURRENCE_TYPES = ['none', 'daily', 'weekly']

DEFAULT_SCHEDULE = {
    'type': 'immediate',
    'start_at': None,
    'end_at': None,
    'recurrence': 'none',
    'days_of_week': [],
    'time_of_day': None,
}


def default_schedule():
    return {**DEFAULT_SCHEDULE}


class PublishVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    playlist = models.ForeignKey(
        'playlists.Playlist',
        on_delete=models.CASCADE,
        related_name='versions',
        verbose_name='برنامه نمایش',
    )
    version_no = models.PositiveIntegerField(verbose_name='شماره نسخه')
    snapshot = models.JSONField(default=dict, blank=True, verbose_name='اسنپ‌شات')
    created_by = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='publish_versions',
        verbose_name='انتشاردهنده',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان انتشار')

    class Meta:
        ordering = ['-created_at']
        unique_together = ('playlist', 'version_no')
        verbose_name = 'نسخه انتشار'
        verbose_name_plural = 'نسخه‌های انتشار'

    def __str__(self):
        return f'{self.playlist_id} v{self.version_no}'


class Deployment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.ForeignKey(PublishVersion, on_delete=models.CASCADE, related_name='deployments', verbose_name='نسخه')
    device = models.ForeignKey(
        'devices.Device',
        on_delete=models.CASCADE,
        related_name='deployments',
        verbose_name='دستگاه',
    )
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL, verbose_name='اولویت')
    schedule = models.JSONField(default=default_schedule, blank=True, verbose_name='زمان‌بندی')
    status = models.CharField(
        max_length=20,
        choices=[(s, s) for s in DEPLOYMENT_STATUSES],
        default=STATUS_PENDING_CONNECTION,
        db_index=True,
        verbose_name='وضعیت',
    )
    progress = models.PositiveIntegerField(default=0, verbose_name='پیشرفت دانلود (٪)')
    error = models.TextField(null=True, blank=True, verbose_name='خطا')
    activated_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان فعال‌سازی')
    created_by = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='deployments',
        verbose_name='سازنده',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ایجاد')

    class Meta:
        ordering = ['-created_at']
        unique_together = ('version', 'device')
        verbose_name = 'انتشار'
        verbose_name_plural = 'انتشارها'

    def __str__(self):
        return f'{self.version_id}→{self.device_id}:{self.status}'
