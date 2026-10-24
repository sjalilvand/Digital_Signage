"""سرو فایل با پشتیبانی دستی HTTP Range — برای دانلود قابل‌ادامه دستگاه‌ها (قرارداد §4.5).

- `Range: bytes=N-` یا `bytes=N-M` یا `bytes=-M` → 206 + Content-Range + Accept-Ranges: bytes
- پشتیبانی پایه If-Range/ETag
"""
import hashlib
import mimetypes
import os
import re

from django.http import FileResponse, HttpResponse, StreamingHttpResponse

_RANGE_RE = re.compile(r'^bytes=(\d*)-(\d*)$')


def _etag(path, size):
    try:
        mtime = int(os.path.getmtime(path))
    except OSError:
        mtime = 0
    return '"%s"' % hashlib.md5(f'{path}:{size}:{mtime}'.encode('utf-8')).hexdigest()


def serve_ranged(request, field_file, download_name=None):
    try:
        path = field_file.path
        size = field_file.size
    except (NotImplementedError, ValueError, OSError):
        # بک‌اند ذخیره‌سازی بدون دسترسی مستقیم به مسیر فایل
        resp = FileResponse(field_file.open('rb'))
        resp['Accept-Ranges'] = 'bytes'
        return resp

    content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    etag = _etag(path, size)
    base_headers = {'Accept-Ranges': 'bytes', 'ETag': etag}
    if download_name:
        base_headers['Content-Disposition'] = f'attachment; filename="{download_name}"'

    range_header = (request.META.get('HTTP_RANGE') or '').strip()
    match = _RANGE_RE.match(range_header) if range_header else None

    if match and size > 0:
        start_s, end_s = match.groups()
        if not (start_s == '' and end_s == ''):
            if start_s == '':
                # پسوند: آخرین M بایت
                length = min(int(end_s), size)
                start = max(0, size - length)
                end = size - 1
            else:
                start = int(start_s)
                end = int(end_s) if end_s else size - 1
            if start >= size:
                resp = HttpResponse(status=416)
                resp['Content-Range'] = f'bytes */{size}'
                return resp
            end = min(end, size - 1)

            if_range = request.META.get('HTTP_IF_RANGE')
            if if_range and if_range.strip() != etag:
                # ناسازگار → پاسخ کامل
                start, end = 0, size - 1

            def byte_stream(start=start, end=end):
                with open(path, 'rb') as fh:
                    fh.seek(start)
                    remaining = end - start + 1
                    while remaining > 0:
                        chunk = fh.read(min(64 * 1024, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            resp = StreamingHttpResponse(byte_stream(), status=206, content_type=content_type)
            resp['Content-Range'] = f'bytes {start}-{end}/{size}'
            resp['Content-Length'] = str(end - start + 1)
            for key, value in base_headers.items():
                resp[key] = value
            return resp

    resp = FileResponse(open(path, 'rb'), content_type=content_type)
    for key, value in base_headers.items():
        resp[key] = value
    return resp
