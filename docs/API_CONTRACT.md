# قرارداد API — نسخه ۱.۰ (منبع واحد حقیقت برای سرور، پنل و اپلیکیشن اندروید)

این سند قرارداد دقیق ارتباط بین «سرور Django»، «پنل React» و «اپلیکیشن اندروید» است.
هیچ جزئی نباید بدون به‌روزرسانی این فایل تغییر کند.

---

## ۰. مقدمات کلی

- نسخه‌بندی URL: پنل `/api/v1/` و دستگاه `/device-api/v1/`
- فرمت داده: JSON (UTF-8). تاریخ‌ها ISO-8601 با آفست (`2026-01-01T10:00:00+03:30`).
- شناسه‌ها: UUID (string).
- فایل‌ها: از مسیر `/device-api/v1/files/...` سرو می‌شوند و **باید Range header (دانلود از سر مسیر) را پشتیبانی کنند**.
- CORS برای پنل فعال است.
- محدودیت حجم آپلود: پیش‌فرض 2GB (`DATA_UPLOAD_MAX_MEMORY_SIZE` و nginx `client_max_body_size`).

## ۱. احراز هویت

### ۱.۱ کاربران پنل (JWT)
- `POST /api/v1/auth/login/` بدنه `{"username": "...", "password": "..."}` →
  `{"access": "...", "refresh": "...", "user": {"id": 1, "username": "admin", "first_name": "", "last_name": "", "roles": ["admin","publisher"]}}`
- `POST /api/v1/auth/refresh/` بدنه `{"refresh": "..."}` → `{"access": "..."}` (401 اگر نامعتبر)
- هدر: `Authorization: Bearer <access>`
- نقش‌ها (enum رشته‌ای): `admin` | `content_manager` | `publisher` | `viewer`
  - admin: همه‌چیز + کاربران و تنظیمات
  - content_manager: بارگذاری/ویرایش محتوا، ساخت برنامه نمایش
  - publisher: انتشار، مقصد، زمان‌بندی، فرمان دستگاه
  - viewer: فقط GET (وضعیت و گزارش)
- ورود با JWT (djangorestframework-simplejwt). دسترسی نقش‌ها با permission سفارشی `RolePermission` بررسی می‌شود.

### ۱.۲ دستگاه‌ها (Device Token)
- هدر: `Authorization: Device <device_token>`  (توکن یکتا ۴۰ کاراکتری، فقط یک‌بار هنگام جفت‌سازی صادر و پس از آن قابل نمایش مجدد نیست؛ امکان regenerate از پنل)
- `POST /device-api/v1/enroll/` بدنه `{"pairing_code": "AB12CD34"}` →
  `{"device_id": "uuid", "device_token": "...", "server_time": "iso", "device_name": "آسانسور شرقی", "poll_interval_sec": 15}`
  - `pairing_code` از پنل صادر می‌شود (۸ کاراکتر، یک‌بارمصرف تا موفقیت جفت‌سازی، انقضا پیش‌فرض ۲۴ ساعت).
  - کد اشتباه → 400 `{"detail": "کد جفت‌سازی نامعتبر است"}`

## ۲. مدل‌های اصلی (منبع مشترک)

### ۲.۱ Content — محتوای کتابخانه
```json
{
  "id": "uuid",
  "name": "فیلم معرفی",
  "description": "",
  "type": "video",            // video | audio | image | pdf | html | text
  "status": "ready",          // uploaded | processing | ready | failed
  "error_message": null,
  "size_bytes": 10485760,
  "duration_sec": 62.5,       // video/audio فقط
  "pdf_pages": 12,            // pdf فقط
  "width": 1920, "height": 1080,   // image/video
  "sha256": "hex64",
  "thumbnail_url": "/media/thumbs/xxx.jpg",
  "tags": ["اطلاعیه"],
  "uploaded_by": {"id": 1, "username": "admin"},
  "created_at": "iso",
  "expiry_date": null,        // yyyy-mm-dd یا null
  "html_entry": "index.html", // html فقط
  "text_data": null,          // text فقط: {"title","body","bg_color","fg_color","image_url"}
  "original_url": "/device-api/v1/files/<id>/original/",
  "superseded_by": null       // uuid محتوای جایگزین
}
```
- وضعیت‌ها: `uploaded → processing → ready | failed` (worker پس‌زمینه)
- PDF: worker تصاویر صفحات را می‌سازد (`RenderedAsset`, kind=`pdf_page`).
- HTML: worker بسته zip را اعتبارسنجی می‌کند (ورودی موجود، مسیر نسبی، بدون path traversal، سقف حجم استخراج).
- video/audio: مدت با ffprobe، thumbnail با ffmpeg.
- قواعد: نوع متناقض با محتوا → `failed` با پیام فارسی. حذف محتوای درحال‌استفاده در برنامه فعال → 409.

### ۲.۲ Playlist — برنامه نمایش
```json
{
  "id": "uuid", "name": "اطلاع‌رسانی آسانسورها", "description": "",
  "created_by": {"id":1,"username":"admin"},
  "created_at": "iso", "updated_at": "iso",
  "items": [
    {
      "id": "uuid", "order": 1, "content_id": "uuid", "content_name": "فیلم معرفی",
      "duration_sec": null,        // null = پخش تا پایان (video/audio)
      "mute": false, "volume": 80, // 0..100
      "fit_mode": "contain",       // contain | cover | stretch
      "background_color": "#000000",
      "pdf_pages": null,           // null = همه صفحات؛ مثال [1,2,5]
      "pdf_seconds_per_page": 10,
      "repeat_count": null,
      "audio_bg_content_id": null  // نسخه ۱: null
    }
  ]
}
```

### ۲.۳ PublishVersion — نسخه انتشار (تغییرناپذیر)
- snapshot ایزوله از برنامه در لحظه انتشار؛ ویرایش برنامه بعدی، نسخه جدید می‌سازد.
```json
{
  "id": "uuid", "playlist_id": "uuid", "playlist_name": "...",
  "version_no": 12, "created_by": {...}, "created_at": "iso",
  "snapshot": {"items": [ /* همان آیتم‌های Playlist با فراداده کامل محتوا */ ]}
}
```

### ۲.۴ Deployment — مقصد انتشار (per device × version)
```json
{
  "id": "uuid", "version_id": "uuid", "device_id": "uuid",
  "priority": "normal",          // normal | high
  "schedule": {
    "type": "immediate",         // immediate | scheduled | recurring | expiry
    "start_at": null, "end_at": null,
    "recurrence": "none",        // none | daily | weekly
    "days_of_week": [],          // weekly: [0..6] (0=شنبه)
    "time_of_day": null          // "HH:MM"
  },
  "status": "downloading",
  // pending_connection | downloading | ready | active | playing | failed | cancelled | replaced
  "progress": 65,                // 0..100 فقط هنگام downloading
  "error": null,
  "created_by": {...}, "created_at": "iso",
  "activated_at": null
}
```

### ۲.۵ Device
```json
{
  "id": "uuid", "name": "آسانسور شرقی",
  "pairing_code": "AB12CD34",     // فقط تا اولین enroll معتبر است؛ سپس null
  "pairing_code_expires_at": "iso|null",
  "model": "...", "android_version": "11", "app_version": "1.0.0",
  "status": "online",             // online = last_seen < ONLINE_THRESHOLD (60s) → وگرنه offline
  "last_seen_at": "iso|null",
  "free_space_mb": 4321,
  "active_version_id": "uuid|null", "active_version_no": 12,
  "playing_item": "اطلاعیه تصویری",
  "download_version_id": "uuid|null", "download_progress": 65,
  "last_error": null,
  "is_blocked": false,
  "created_at": "iso"
}
```

### ۲.۶ DeviceCommand — فرمان‌های سرور به دستگاه
action enum: `refresh_status` | `cancel_pending` | `rollback` | `set_volume` (params: `{"volume": 50}`) | `pause_playback` | `resume_playback` | `cleanup_files`
```json
{"id": 1, "device_id": "uuid", "action": "set_volume", "params": {"volume": 50},
 "status": "pending", "created_at": "iso", "acknowledged_at": null, "result": null}
```

## ۳. اندپوینت‌های پنل (`/api/v1/`، JWT)

| متد و مسیر | توضیح |
|---|---|
| `POST /auth/login/` `POST /auth/refresh/` | JWT |
| `GET/POST /users/` `PATCH/DELETE /users/{id}/` | فقط admin. بدنه: `username, password, first_name, last_name, roles[]` |
| `GET /contents/?type=&status=&search=&tag=&page=&page_size=` | فهرست + فیلتر. پاسخ: `{"count", "results": [...]}` |
| `POST /contents/` | multipart: `file` + `name,type,description,tags,expiry_date,text_data(json)` |
| `GET/PATCH/DELETE /contents/{id}/` | DELETE درحال‌استفاده → 409 |
| `POST /contents/{id}/replace/` | multipart فایل جدید → Content جدید + `superseded_by` |
| `GET /contents/{id}/usage/` | `{"playlists": [...], "active_deployments": n}` |
| `GET /contents/{id}/assets/` | `[{id, kind, page_number, url, width, height, size_bytes}]` |
| `GET/POST /playlists/` `GET/PATCH/DELETE /playlists/{id}/` | آیتم‌ها داخل همان آبجکت |
| `PUT /playlists/{id}/items/` | جایگزینی کامل آیتم‌ها (drag&drop ذخیره با همین) |
| `GET /publish-versions/` `GET /publish-versions/{id}/` | |
| `POST /publish/` | بدنه: `{"playlist_id","device_ids":[...],"priority":"normal","schedule":{...}}` → 201 `{"version": {...}, "deployments": [...]}` |
| `GET /deployments/?device=&status=&version=` | |
| `POST /deployments/{id}/cancel/` | لغو انتشار در انتظار (pending_connection/downloading) |
| `POST /devices/` | ساخت دستگاه + صدور pairing_code |
| `GET/PATCH /devices/{id}/` | PATCH: name, is_blocked |
| `POST /devices/{id}/regenerate-token/` | توکن جدید (توکن قدیمی باطل) |
| `POST /devices/{id}/commands/` | بدنه `{"action": "...", "params": {}}` |
| `GET /devices/{id}/status-history/?limit=50` | آخرین DeviceStatusReportها |
| `POST /devices/{id}/rollback/` | فعال‌سازی نسخه آماده قبلی، اگر فایل‌ها موجود |
| `GET /dashboard/` | `{"devices": [...همان Device + deployment summary...], "counts": {"online":2,"offline":1,"deploying":1}}` |
| `GET /reports/playback/?device=&from=&to=&page=` | |
| `GET /reports/audit/?page=` | |
| `GET /settings/` `PATCH /settings/` | `{"online_threshold_sec":60, "pdf_dpi":150, "pdf_jpeg_quality":85, "max_upload_gb":2, "default_poll_interval_sec":15}` |

## ۴. اندپوینت‌های دستگاه (`/device-api/v1/`، Device Token)

### ۴.۱ `GET /manifest/`
وضعیت مطلوب دستگاه. دستگاه هر `poll_interval_sec` (پیش‌فرض ۱۵ ثانیه) آن را می‌گیرد؛
WebSocket برای دستگاه اجباری نیست (قطع لحظه‌ای نباید دستور انتشار را از دست بدهد).
```json
{
  "server_time": "iso", "poll_interval_sec": 15,
  "device": {"id": "uuid", "name": "آسانسور شرقی"},
  "versions": [
    {
      "deployment_id": "uuid", "version_id": "uuid", "version_no": 12,
      "priority": "high", "playlist_name": "اطلاع‌رسانی آسانسورها",
      "schedule": {"type": "immediate", "start_at": null, "end_at": null,
                   "recurrence": "none", "days_of_week": [], "time_of_day": null},
      "server_hint_status": "downloading",
      "items": [
        {
          "order": 1, "content_id": "uuid", "content_name": "فیلم معرفی",
          "type": "video", "duration_sec": null,
          "mute": false, "volume": 80, "fit_mode": "contain",
          "background_color": "#000000",
          "pdf_pages": null, "pdf_seconds_per_page": 10, "repeat_count": null,
          "text_data": null,
          "files": [
            {"role": "original", "url": "/device-api/v1/files/<cid>/original/",
             "sha256": "hex64", "size": 10485760},
            {"role": "pdf_page", "page": 1, "url": "/device-api/v1/files/<cid>/assets/<aid>/",
             "sha256": "...", "size": 234567}
          ]
        }
      ]
    }
  ],
  "commands": [{"id": 1, "action": "set_volume", "params": {"volume": 50}}]
}
```
قواعد انتخاب نسخه روی دستگاه (سرویس پخش):
1. `high` فعال و داخل بازه → پخش (اطلاعیه فوری)
2. نسخه‌های `scheduled/recurring` فعال داخل بازه
3. نسخه پیش‌فرض (قدیمی‌ترین active بدون پایان اعتبار) — دستگاه فقط نسخه‌های `ready+` را فعال می‌کند.
دستگاه هرگز نسخه ناقص را فعال نمی‌کند؛ تا آماده‌شدن کامل، نسخه قبلی ادامه دارد.

### ۴.۲ `POST /report/status/`
```json
{
  "app_version": "1.0.0", "android_version": "11", "model": "MBX21",
  "free_space_mb": 4321, "network": "wifi",       // wifi | disconnected
  "deployments": [
    {"deployment_id": "uuid", "status": "downloading", "progress": 65, "error": null},
    {"deployment_id": "uuid", "status": "ready", "progress": null, "error": null},
    {"deployment_id": "uuid", "status": "active", "progress": null, "error": null}
  ],
  "playing": {"version_id": "uuid", "item_order": 2, "content_id": "uuid", "started_at": "iso"}
}
```
→ پاسخ `{"ok": true, "server_time": "iso"}`. سرور `Device.last_seen_at` و وضعیت‌ها را به‌روزرسانی می‌کند؛ اگر `network=disconnected` هم گزارش پذیرفته می‌شود (تاریخ last_seen جلو نمی‌رود ولی صف گزارش قبلی اعمال می‌شود).

### ۴.۳ `POST /report/playback/`
```json
{"version_id": "uuid", "deployment_id": "uuid", "content_id": "uuid",
 "started_at": "iso", "duration_sec": 15.2, "completed": true, "error": null}
```
دستگاه گزارش‌های ناموفق شبکه را در Room صف می‌کند و بعداً می‌فرستد (`batch: [ ... ]` مجاز — آرایه هم پذیرفته می‌شود).

### ۴.۴ `POST /ack/command/`
`{"command_id": 1, "result": "ok"}` یا `{"command_id": 1, "result": "error: ..."}`

### ۴.۵ فایل‌ها (پشتیبانی Range برای ادامه دانلود)
- `GET /device-api/v1/files/{content_id}/original/`
- `GET /device-api/v1/files/{content_id}/assets/{asset_id}/`
- هدر `Range: bytes=N-` → پاسخ 206 با `Content-Range`. سرور با `FileResponse` + FileWrapper و `If-Range/ETag` پیاده می‌کند (در nginx مسیر `/media/` هم Range بومی دارد؛ اندپوینت بالا کنترل دسترسی دستگاه دارد).

## ۵. WebSocket پنل (`/ws/dashboard/`)
- احراز: `?token=<jwt>` در query string.
- سرور event می‌فرستد:
```json
{"type": "device.updated", "payload": { /* Device */ }}
{"type": "deployment.updated", "payload": { /* Deployment */ }}
```
- پنل در صورت قطع WS، به polling داشبورد (هر ۱۰ ثانیه) fallback می‌کند.
- سرور: Django Channels + channels-redis، مصرف‌کننده `DashboardConsumer`؛ به‌روزرسانی‌ها با `dashboard_notify(device_payload)` از سیگنال/کد اپلیکیشن ارسال می‌شود.

## ۶. Celery
- صف Redis. تسک‌ها:
  - `process_content(content_id)` — اعتبارسنجی، hash، metadata، thumbnail، PDF→تصویر، اعتبارسنجی HTML zip
  - `cleanup_unused_files()` — حذف فایل محتوای منقضی/بدون استفاده (خیلی محتاطانه؛ فقط superseded و بدون ارجاع فعال)
  - `mark_offline_devices()` — هر ۳۰ ثانیه: دستگاه‌های `last_seen > threshold` → offline؛ انتشار event WS
- Beat: `mark_offline_devices` هر ۳۰ ثانیه.

## ۷. کدهای خطای متعارف
- 400: بدنه نامعتبر (پیام فارسی)، 401: بدون/توکن منقضی، 403: نقش ناکافی یا دستگاه مسدود، 404، 409: تداخل (مثلاً حذف محتوای درحال‌استفاده)، 413: حجم بیش از حد، 500: خطای سرور.
- شکل خطا: `{"detail": "متن فارسی"}` یا فیلد-محور `{"field": ["متن"]}`.
