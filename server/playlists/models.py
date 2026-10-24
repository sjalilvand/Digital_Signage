"""مدل‌های برنامه نمایش (قرارداد §2.2)."""
import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from library.models import Content

FIT_CONTAIN = 'contain'
FIT_COVER = 'cover'
FIT_STRETCH = 'stretch'
FIT_MODES = [FIT_CONTAIN, FIT_COVER, FIT_STRETCH]


class Playlist(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, verbose_name='نام')
    description = models.TextField(blank=True, default='', verbose_name='توضیح')
    created_by = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='playlists',
        verbose_name='سازنده',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ایجاد')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='زمان آخرین ویرایش')

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'برنامه نمایش'
        verbose_name_plural = 'برنامه‌های نمایش'

    def __str__(self):
        return self.name


class PlaylistItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name='items', verbose_name='برنامه')
    order = models.PositiveIntegerField(default=1, verbose_name='ترتیب')
    content = models.ForeignKey(Content, on_delete=models.CASCADE, related_name='playlist_items', verbose_name='محتوا')
    duration_sec = models.PositiveIntegerField(null=True, blank=True, verbose_name='مدت پخش (ثانیه)؛ خالی=تا پایان')
    mute = models.BooleanField(default=False, verbose_name='بی‌صدا')
    volume = models.PositiveIntegerField(
        default=80,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name='صدا (0..100)',
    )
    fit_mode = models.CharField(
        max_length=10,
        choices=[(f, f) for f in FIT_MODES],
        default=FIT_CONTAIN,
        verbose_name='حالت نمایش',
    )
    background_color = models.CharField(max_length=9, default='#000000', verbose_name='رنگ پس‌زمینه')
    pdf_pages = models.JSONField(null=True, blank=True, verbose_name='صفحات PDF (خالی=همه)')
    pdf_seconds_per_page = models.PositiveIntegerField(default=10, verbose_name='ثانیه در هر صفحه PDF')
    repeat_count = models.PositiveIntegerField(null=True, blank=True, verbose_name='تعداد تکرار')
    audio_bg_content = models.ForeignKey(
        Content,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='صدای پس‌زمینه (نسخه ۱: بدون استفاده)',
    )

    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'آیتم برنامه'
        verbose_name_plural = 'آیتم‌های برنامه'

    def __str__(self):
        return f'{self.playlist_id}#{self.order}:{self.content_id}'
