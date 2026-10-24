"""تسک‌های Celery: پردازش محتوا، آفلاین‌کردن دستگاه‌ها، پاکسازی فایل‌ها.

- process_content: اعتبارسنجی + فراداده + بندانگشتی + رندر PDF → تصویر + اعتبارسنجی بسته HTML
  (قرارداد §6 — PDF در سرور به تصاویر صفحات تبدیل می‌شود تا باکس فقط تصویر نمایش دهد).
- mark_offline_devices: هر ۳۰ ثانیه (beat) — آستانه از Setting.
- cleanup_unused_files: حذف محافظه‌کارانه خروجی‌های نسخه‌های جایگزین‌شده.
"""
import hashlib
import json
import logging
import os
import re
import subprocess
import tempfile
import zipfile
from io import BytesIO

from celery import shared_task
from django.conf import settings as dj_settings
from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone
from PIL import Image

logger = logging.getLogger(__name__)

MAX_PDF_PAGES = 200
_HTML_HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _sha256_file(path, chunk_size=1024 * 1024):
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _ffprobe(path):
    """فراداده صوت/ویدئو با ffprobe؛ خروجی: (duration_sec, width, height)."""
    cmd = [
        'ffprobe', '-v', 'error', '-print_format', 'json',
        '-show_format', '-show_streams', str(path),
    ]
    out = subprocess.run(cmd, capture_output=True, timeout=120, check=True)
    info = json.loads(out.stdout.decode('utf-8'))
    duration = None
    width = height = None
    fmt = info.get('format') or {}
    if fmt.get('duration'):
        try:
            duration = float(fmt['duration'])
        except (TypeError, ValueError):
            duration = None
    for stream in info.get('streams') or []:
        if stream.get('codec_type') == 'video':
            width = stream.get('width') or width
            height = stream.get('height') or height
            if duration is None and stream.get('duration'):
                try:
                    duration = float(stream['duration'])
                except (TypeError, ValueError):
                    duration = None
            break
    return duration, width, height


def _make_video_thumbnail(path, out_path):
    """فریم حدوداً ثانیه اول؛ برای ویدئوهای خیلی کوتاه روی ۰ ثانیه fallback."""
    for seek in ('1', '0'):
        cmd = [
            'ffmpeg', '-y', '-v', 'error', '-ss', seek, '-i', str(path),
            '-frames:v', '1', '-vf', "scale='min(320,iw)':-1", '-q:v', '4',
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
            return True
    return False


def _save_thumbnail(content, data_or_path):
    """ذخیره بندانگشتی JPEG (ورودی: مسیر فایل یا بایت‌ها)."""
    buf = BytesIO()
    if isinstance(data_or_path, (bytes, bytearray)):
        img = Image.open(BytesIO(bytes(data_or_path)))
    else:
        img = Image.open(data_or_path)
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')
    img.thumbnail((320, 320))
    img.save(buf, format='JPEG', quality=80)
    buf.seek(0)
    name = f'content_{content.pk[:12]}.jpg' if isinstance(content.pk, str) else f'content_{content.pk}.jpg'
    content.thumbnail.save(name, ContentFile(buf.read()), save=False)


def _process_pdf(content, pdf_path, dpi, quality):
    """PDF → تصاویر صفحات (RenderedAsset kind=pdf_page) + بندانگشتی صفحه ۱."""
    import fitz  # PyMuPDF

    # پاکسازی خروجی‌های قبلی (پردازش مجدد)
    for old in content.assets.filter(kind='pdf_page'):
        old.file.delete(save=False)
        old.delete()

    doc = fitz.open(pdf_path)
    try:
        total = doc.page_count
        if total == 0:
            raise ValueError('فایل PDF هیچ صفحه‌ای ندارد')
        content.pdf_pages = total
        matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        for index in range(min(total, MAX_PDF_PAGES)):
            page = doc.load_page(index)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            buf = BytesIO()
            img.save(buf, format='JPEG', quality=quality)
            data = buf.getvalue()
            asset = content.assets.model(
                content=content,
                kind='pdf_page',
                page_number=index + 1,
                width=pix.width,
                height=pix.height,
                size_bytes=len(data),
                sha256=_sha256_bytes(data),
            )
            asset.file.save(f'{content.pk}_page_{index + 1:04d}.jpg', ContentFile(data), save=False)
            asset.save()
            if index == 0:
                _save_thumbnail(content, img)
        if total > MAX_PDF_PAGES:
            logger.warning('PDF با %s صفحه فقط تا صفحه %s رندر شد (content=%s)', total, MAX_PDF_PAGES, content.pk)
    finally:
        doc.close()


def _process_html(content, html_path):
    """اعتبارسنجی بسته HTML (قرارداد §7): ورودی، مسیر نسبی، سقف فایل/حجم."""
    entry = content.html_entry or 'index.html'
    max_extract_bytes = (dj_settings.MAX_UPLOAD_GB * 2) * (1024 ** 3)
    max_files = 5000
    total_uncompressed = 0
    file_count = 0

    with zipfile.ZipFile(html_path) as zf:
        if zf.testzip() is not None:
            raise ValueError('بسته ZIP خراب است')
        names = zf.namelist()
        if not names:
            raise ValueError('بسته HTML خالی است')
        for name in names:
            if name.startswith('/') or '\\' in name:
                raise ValueError(f'مسیر نامعتبر در بسته: {name}')
            parts = name.split('/')
            if any(p == '..' for p in parts):
                raise ValueError(f'مسیر ناامن در بسته: {name}')
            if name.endswith('/'):
                continue
            file_count += 1
            if file_count > max_files:
                raise ValueError('تعداد فایل‌های بسته بیش از حد مجاز است')
            total_uncompressed += zf.getinfo(name).file_size
            if total_uncompressed > max_extract_bytes:
                raise ValueError('حجم استخراج بسته بیش از حد مجاز است')
        entry_names = {n.strip('/') for n in names}
        if entry not in entry_names:
            raise ValueError(f'فایل شروع «{entry}» در ریشه بسته یافت نشد')
    content.html_entry = entry


def _process_text(content):
    """اعتبارسنجی قالب متن/اطلاعیه: عنوان، متن و رنگ‌ها."""
    data = content.text_data
    if not isinstance(data, dict):
        raise ValueError('قالب متن باید شامل title و body باشد')
    if not str(data.get('title') or '').strip() and not str(data.get('body') or '').strip():
        raise ValueError('عنوان یا متن اطلاعیه خالی است')
    for key in ('bg_color', 'fg_color'):
        value = data.get(key)
        if value and not _HTML_HEX_COLOR_RE.match(str(value)):
            raise ValueError(f'رنگ {key} باید به شکل #RRGGBB باشد')


# ---------------------------------------------------------------------------
# تسک‌ها
# ---------------------------------------------------------------------------
@shared_task(bind=True, max_retries=1, default_retry_delay=10)
def process_content(self, content_id):
    """پردازش پس‌زمینه محتوا: uploaded/failed → ready یا failed (با پیام فارسی)."""
    from library.models import Content

    content = Content.objects.filter(pk=content_id).first()
    if content is None:
        logger.warning('محتوای %s یافت نشد', content_id)
        return

    content.status = 'processing'
    content.error_message = None
    content.save(update_fields=['status', 'error_message'])

    try:
        setting_path = content.original_file.path
    except (NotImplementedError, ValueError, OSError):
        setting_path = None
    if content.type != 'text' and (not content.original_file or not setting_path or not os.path.isfile(setting_path)):
        content.status = 'failed'
        content.error_message = 'فایل اصلی محتوا یافت نشد'
        content.save(update_fields=['status', 'error_message'])
        return

    try:
        if content.type == 'video':
            duration, width, height = _ffprobe(setting_path)
            if duration is None:
                raise ValueError('خواندن مدت ویدئو ناموفق بود؛ کدک پشتیبانی نمی‌شود')
            content.duration_sec = duration
            content.width = width
            content.height = height
            with tempfile.TemporaryDirectory() as tmp:
                thumb = os.path.join(tmp, 'thumb.jpg')
                if _make_video_thumbnail(setting_path, thumb):
                    _save_thumbnail(content, thumb)
        elif content.type == 'audio':
            duration, _, _ = _ffprobe(setting_path)
            if duration is None:
                raise ValueError('خواندن مدت فایل صوتی ناموفق بود')
            content.duration_sec = duration
        elif content.type == 'image':
            with Image.open(setting_path) as img:
                content.width, content.height = img.size
                _save_thumbnail(content, setting_path)
        elif content.type == 'pdf':
            from core.models import Setting

            setting = Setting.get_solo()
            _process_pdf(content, setting_path, setting.pdf_dpi, setting.pdf_jpeg_quality)
        elif content.type == 'html':
            _process_html(content, setting_path)
        elif content.type == 'text':
            _process_text(content)
        else:
            raise ValueError(f'نوع محتوا پشتیبانی نمی‌شود: {content.type}')

        if setting_path and os.path.isfile(setting_path):
            content.size_bytes = os.path.getsize(setting_path)
            content.sha256 = _sha256_file(setting_path)
        content.status = 'ready'
        content.error_message = None
        content.save()
        logger.info('محتوای %s آماده شد (%s)', content.pk, content.type)
    except Exception as exc:  # noqa: BLE001 — هر خطا → وضعیت failed با پیام فارسی
        content.status = 'failed'
        content.error_message = str(exc) or 'خطای آماده‌سازی محتوا'
        content.save(update_fields=['status', 'error_message'])
        logger.warning('پردازش محتوای %s ناموفق بود: %s', content.pk, exc)


@shared_task
def mark_offline_devices():
    """به‌روزرسانی پرچم آنلاین دستگاه‌ها + انتشار رویداد WS برای تغییر وضعیت."""
    from core.models import Setting
    from core.notify import notify_dashboard
    from devices.models import Device
    from devices.serializers import DeviceSerializer

    threshold = Setting.get_solo().online_threshold_sec
    now = timezone.now()
    cutoff = now - timezone.timedelta(seconds=threshold)

    went_offline = Device.objects.filter(is_online_flag=True).filter(
        Q(last_seen_at__lt=cutoff) | Q(last_seen_at__isnull=True)
    )
    went_online = Device.objects.filter(is_online_flag=False, last_seen_at__gte=cutoff)

    changed = []
    for device in went_offline:
        device.is_online_flag = False
        device.save(update_fields=['is_online_flag'])
        changed.append((device, 'offline'))
    for device in went_online:
        device.is_online_flag = True
        device.save(update_fields=['is_online_flag'])
        changed.append((device, 'online'))

    for device, _state in changed:
        notify_dashboard('device.updated', DeviceSerializer(device).data)
    if changed:
        logger.info('تغییر وضعیت اتصال %s دستگاه اعمال شد', len(changed))


@shared_task
def cleanup_unused_files():
    """حذف محافظه‌کارانه: فایل‌های محتوای جایگزین‌شده (superseded) قدیمی بدون ارجاع فعال.

    فقط محتوایی حذف می‌شود که:
    - superseded_by دارد و تاریخ ایجاد آن بیش از ۷ روز قبل است؛
    - در هیچ آیتم برنامه (PlaylistItem) و در هیچ نسخه انتشار (snapshot) استفاده نشده.
    فایل اصلی حذف می‌شود و وضعیت به «superseded» مفهومی باقی می‌ماند (رکورد حفظ می‌شود).
    """
    import json as _json

    from library.models import Content, RenderedAsset
    from playlists.models import PlaylistItem
    from publishing.models import PublishVersion

    cutoff = timezone.now() - timezone.timedelta(days=7)
    candidates = Content.objects.filter(superseded_by__isnull=False, created_at__lt=cutoff)
    removed = 0
    for content in candidates.iterator():
        in_playlist = PlaylistItem.objects.filter(content=content).exists()
        if in_playlist:
            continue
        used_in_versions = False
        for snapshot in PublishVersion.objects.values_list('snapshot', flat=True).iterator():
            if str(content.pk) in _snapshot_content_ids(snapshot):
                used_in_versions = True
                break
        if used_in_versions:
            continue
        for asset in RenderedAsset.objects.filter(content=content):
            asset.file.delete(save=False)
            asset.delete()
        if content.thumbnail:
            content.thumbnail.delete(save=False)
        if content.original_file:
            content.original_file.delete(save=False)
        removed += 1
    if removed:
        logger.info('%s محتوای منقضی پاکسازی شد', removed)
    return {'removed': removed}


def _snapshot_content_ids(snapshot):
    """استخراج content_idها از اسنپ‌شات نسخه انتشار."""
    ids = set()
    try:
        for item in (snapshot or {}).get('items') or []:
            cid = str(item.get('content_id') or item.get('content') or '')
            if cid:
                ids.add(cid)
    except Exception:  # noqa: BLE001
        pass
    return ids
