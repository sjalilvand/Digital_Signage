"""مدل‌های هسته: Setting (تکی) و AuditLog."""
from django.conf import settings
from django.db import models


class Setting(models.Model):
    """تنظیمات سرور — رکورد تکی (pk=1)."""

    online_threshold_sec = models.PositiveIntegerField(default=60, verbose_name='آستانه آنلاین (ثانیه)')
    pdf_dpi = models.PositiveIntegerField(default=150, verbose_name='DPI رندر PDF')
    pdf_jpeg_quality = models.PositiveIntegerField(default=85, verbose_name='کیفیت JPEG صفحات PDF')
    max_upload_gb = models.PositiveIntegerField(default=2, verbose_name='حداکثر حجم آپلود (GB)')
    default_poll_interval_sec = models.PositiveIntegerField(default=15, verbose_name='فاصله poll دستگاه (ثانیه)')

    class Meta:
        verbose_name = 'تنظیمات'
        verbose_name_plural = 'تنظیمات'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'تنظیمات سرور'


class AuditLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        verbose_name='کاربر',
    )
    action = models.CharField(max_length=100, verbose_name='عملیات')
    object_type = models.CharField(max_length=100, verbose_name='نوع شیء')
    object_id = models.CharField(max_length=128, null=True, blank=True, verbose_name='شناسه شیء')
    details = models.JSONField(default=dict, blank=True, verbose_name='جزئیات')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'گزارش حسابرسی'
        verbose_name_plural = 'گزارش‌های حسابرسی'

    def __str__(self):
        return f'{self.action}:{self.object_type}:{self.object_id}'
