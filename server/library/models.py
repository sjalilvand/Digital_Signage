"""مدل‌های کتابخانه: Tag, Content, RenderedAsset (قرارداد §2.1)."""
import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

TYPE_VIDEO = 'video'
TYPE_AUDIO = 'audio'
TYPE_IMAGE = 'image'
TYPE_PDF = 'pdf'
TYPE_HTML = 'html'
TYPE_TEXT = 'text'
CONTENT_TYPES = [TYPE_VIDEO, TYPE_AUDIO, TYPE_IMAGE, TYPE_PDF, TYPE_HTML, TYPE_TEXT]

STATUS_UPLOADED = 'uploaded'
STATUS_PROCESSING = 'processing'
STATUS_READY = 'ready'
STATUS_FAILED = 'failed'
CONTENT_STATUSES = [STATUS_UPLOADED, STATUS_PROCESSING, STATUS_READY, STATUS_FAILED]


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name='برچسب')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ساخت')

    class Meta:
        ordering = ['name']
        verbose_name = 'برچسب'
        verbose_name_plural = 'برچسب‌ها'

    def __str__(self):
        return self.name


class Content(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, verbose_name='نام')
    description = models.TextField(blank=True, default='', verbose_name='توضیح')
    type = models.CharField(max_length=10, choices=[(t, t) for t in CONTENT_TYPES], verbose_name='نوع')
    status = models.CharField(
        max_length=12,
        choices=[(s, s) for s in CONTENT_STATUSES],
        default=STATUS_UPLOADED,
        db_index=True,
        verbose_name='وضعیت',
    )
    error_message = models.TextField(null=True, blank=True, verbose_name='پیام خطا')
    original_file = models.FileField(upload_to='contents/%Y/%m/', null=True, blank=True, verbose_name='فایل اصلی')
    size_bytes = models.BigIntegerField(null=True, blank=True, verbose_name='حجم (بایت)')
    duration_sec = models.FloatField(null=True, blank=True, verbose_name='مدت (ثانیه)')
    pdf_pages = models.PositiveIntegerField(null=True, blank=True, verbose_name='تعداد صفحات PDF')
    width = models.PositiveIntegerField(null=True, blank=True, verbose_name='عرض')
    height = models.PositiveIntegerField(null=True, blank=True, verbose_name='ارتفاع')
    sha256 = models.CharField(max_length=64, null=True, blank=True, verbose_name='هش SHA256')
    thumbnail = models.FileField(upload_to='thumbs/', null=True, blank=True, verbose_name='تصویر بندانگشتی')
    tags = models.ManyToManyField(Tag, blank=True, related_name='contents', verbose_name='برچسب‌ها')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='uploaded_contents',
        verbose_name='بارگذاری‌کننده',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ایجاد')
    expiry_date = models.DateField(null=True, blank=True, verbose_name='تاریخ انقضا')
    html_entry = models.CharField(max_length=255, null=True, blank=True, verbose_name='فایل ورودی HTML')
    text_data = models.JSONField(null=True, blank=True, verbose_name='داده‌های متن')
    superseded_by = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='supersedes',
        verbose_name='جایگزین‌شده با',
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'محتوا'
        verbose_name_plural = 'محتواها'

    def __str__(self):
        return f'{self.name} ({self.type}/{self.status})'


class RenderedAsset(models.Model):
    KIND_PDF_PAGE = 'pdf_page'
    KIND_PREVIEW = 'preview'
    KIND_CHOICES = [(KIND_PDF_PAGE, 'صفحه PDF'), (KIND_PREVIEW, 'پیش‌نمایش')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.ForeignKey(Content, on_delete=models.CASCADE, related_name='assets', verbose_name='محتوا')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_PDF_PAGE, verbose_name='نوع')
    page_number = models.PositiveIntegerField(null=True, blank=True, verbose_name='شماره صفحه')
    file = models.FileField(upload_to='assets/%Y/%m/', verbose_name='فایل')
    width = models.PositiveIntegerField(null=True, blank=True, verbose_name='عرض')
    height = models.PositiveIntegerField(null=True, blank=True, verbose_name='ارتفاع')
    size_bytes = models.BigIntegerField(null=True, blank=True, verbose_name='حجم (بایت)')
    sha256 = models.CharField(max_length=64, null=True, blank=True, verbose_name='هش SHA256')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ساخت')

    class Meta:
        ordering = ['page_number', 'created_at']
        verbose_name = 'دارایی رندرشده'
        verbose_name_plural = 'دارایی‌های رندرشده'

    def __str__(self):
        return f'{self.content_id}/{self.kind}/{self.page_number}'


@receiver(post_save, sender='library.Content')
def _enqueue_content_processing(sender, instance, created, **kwargs):
    """محتوای تازه‌ساخته‌شده → صف پردازش پس‌زمینه (process_content)."""
    if not created or instance.status != 'uploaded':
        return
    try:
        from core.tasks import process_content

        process_content.delay(str(instance.pk))
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            'ارسال تسک پردازش محتوا به صف ناموفق بود (content=%s)', instance.pk, exc_info=True
        )
