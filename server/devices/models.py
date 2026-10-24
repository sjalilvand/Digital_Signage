"""مدل‌های دستگاه: Device, DeviceStatusReport, DeviceCommand, PlaybackLog (قرارداد §2.5 و §2.6)."""
import secrets
import uuid

from django.db import models

PAIRING_CODE_TTL_HOURS = 24


def generate_pairing_code():
    """کد جفت‌سازی ۸ کاراکتری بدون کاراکترهای گنگ."""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(8))


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, verbose_name='نام دستگاه')
    pairing_code = models.CharField(
        max_length=8, unique=True, null=True, blank=True, db_index=True, verbose_name='کد جفت‌سازی'
    )
    pairing_code_expires_at = models.DateTimeField(null=True, blank=True, verbose_name='انقضای کد جفت‌سازی')
    device_token = models.CharField(
        max_length=40, unique=True, null=True, blank=True, db_index=True, verbose_name='توکن دستگاه'
    )
    model = models.CharField(max_length=100, null=True, blank=True, verbose_name='مدل')
    android_version = models.CharField(max_length=20, null=True, blank=True, verbose_name='نسخه اندروید')
    app_version = models.CharField(max_length=20, null=True, blank=True, verbose_name='نسخه اپ')
    last_seen_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name='آخرین دیده‌شدن')
    free_space_mb = models.BigIntegerField(null=True, blank=True, verbose_name='فضای آزاد (MB)')
    active_version = models.ForeignKey(
        'publishing.PublishVersion',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='active_on_devices',
        verbose_name='نسخه فعال',
    )
    playing_item = models.CharField(max_length=255, null=True, blank=True, verbose_name='آیتم در حال پخش')
    download_version = models.ForeignKey(
        'publishing.PublishVersion',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='downloading_on_devices',
        verbose_name='نسخه در حال دانلود',
    )
    download_progress = models.PositiveIntegerField(default=0, verbose_name='پیشرفت دانلود (٪)')
    last_error = models.TextField(null=True, blank=True, verbose_name='آخرین خطا')
    is_blocked = models.BooleanField(default=False, verbose_name='مسدود')
    is_online_flag = models.BooleanField(default=False, editable=False, verbose_name='پرچم آنلاین (کش)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ایجاد')

    class Meta:
        ordering = ['created_at']
        verbose_name = 'دستگاه'
        verbose_name_plural = 'دستگاه‌ها'

    def __str__(self):
        return self.name

    @property
    def is_authenticated(self):
        # شیء Device هرگز «کاربر پنل» نیست؛ از خطای DRF IsAuthenticated جلوگیری می‌کند
        return False


class DeviceStatusReport(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='status_reports', verbose_name='دستگاه')
    payload = models.JSONField(default=dict, blank=True, verbose_name='بار گزارش')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'گزارش وضعیت'
        verbose_name_plural = 'گزارش‌های وضعیت'

    def __str__(self):
        return f'{self.device_id}@{self.created_at}'


class DeviceCommand(models.Model):
    ACTION_REFRESH_STATUS = 'refresh_status'
    ACTION_CANCEL_PENDING = 'cancel_pending'
    ACTION_ROLLBACK = 'rollback'
    ACTION_SET_VOLUME = 'set_volume'
    ACTION_PAUSE_PLAYBACK = 'pause_playback'
    ACTION_RESUME_PLAYBACK = 'resume_playback'
    ACTION_CLEANUP_FILES = 'cleanup_files'
    ACTION_CHOICES = [
        (ACTION_REFRESH_STATUS, ACTION_REFRESH_STATUS),
        (ACTION_CANCEL_PENDING, ACTION_CANCEL_PENDING),
        (ACTION_ROLLBACK, ACTION_ROLLBACK),
        (ACTION_SET_VOLUME, ACTION_SET_VOLUME),
        (ACTION_PAUSE_PLAYBACK, ACTION_PAUSE_PLAYBACK),
        (ACTION_RESUME_PLAYBACK, ACTION_RESUME_PLAYBACK),
        (ACTION_CLEANUP_FILES, ACTION_CLEANUP_FILES),
    ]

    STATUS_PENDING = 'pending'
    STATUS_SENT = 'sent'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_CHOICES = [
        (STATUS_PENDING, STATUS_PENDING),
        (STATUS_SENT, STATUS_SENT),
        (STATUS_ACKNOWLEDGED, STATUS_ACKNOWLEDGED),
    ]

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='commands', verbose_name='دستگاه')
    action = models.CharField(max_length=30, choices=ACTION_CHOICES, verbose_name='فرمان')
    params = models.JSONField(default=dict, blank=True, verbose_name='پارامترها')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='وضعیت')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ارسال')
    acknowledged_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان تایید')
    result = models.TextField(null=True, blank=True, verbose_name='نتیجه')

    class Meta:
        ordering = ['created_at']
        verbose_name = 'فرمان دستگاه'
        verbose_name_plural = 'فرمان‌های دستگاه'

    def __str__(self):
        return f'#{self.pk}:{self.device_id}:{self.action}'


class PlaybackLog(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='playback_logs', verbose_name='دستگاه')
    version_id = models.UUIDField(verbose_name='شناسه نسخه')
    deployment_id = models.UUIDField(null=True, blank=True, verbose_name='شناسه انتشار')
    content_id = models.UUIDField(db_index=True, verbose_name='شناسه محتوا')
    started_at = models.DateTimeField(verbose_name='زمان شروع پخش')
    duration_sec = models.FloatField(null=True, blank=True, verbose_name='مدت (ثانیه)')
    completed = models.BooleanField(default=False, verbose_name='تکمیل شد')
    error = models.TextField(null=True, blank=True, verbose_name='خطا')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ثبت')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'گزارش پخش'
        verbose_name_plural = 'گزارش‌های پخش'

    def __str__(self):
        return f'{self.device_id}:{self.content_id}@{self.started_at}'
