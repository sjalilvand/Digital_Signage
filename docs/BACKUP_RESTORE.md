# راهنمای پشتیبان‌گیری و بازیابی

داده‌های پایدار سامانه (SRS §15) شامل: دیتابیس، فایل‌های اصلی، فایل‌های آماده نمایش، نسخه‌های انتشار و بکاپ‌ها است.

## ۱. چه چیزی پشتیبان گرفته شود

| داده | محل (volume داکر) | توضیح |
|---|---|---|
| دیتابیس PostgreSQL | `postgres_data` | کاربران، دستگاه‌ها، محتواها، برنامه‌ها، نسخه‌ها، گزارش‌ها |
| فایل‌های رسانه | `media_data` (`/data/media`) | فایل اصلی + تصاویر PDF + بندانگشتی‌ها |
| فایل‌های استاتیک | `static_data` | بازتولیدشدنی (collectstatic) — بکاپ لازم نیست |

## ۲. بکاپ دستی (فوری)

```bash
cd <پوشه پروژه>

# دیتابیس
docker compose exec -T db pg_dump -U signage signage | gzip > backups/db-$(date +%F-%H%M).sql.gz

# رسانه‌ها (فایل اصلی + خروجی‌های آماده)
docker run --rm -v digital-signage_media_data:/data -v "$PWD/backups":/backup \
  alpine tar czf /backup/media-$(date +%F-%H%M).tar.gz -C /data media
```

## ۳. بکاپ خودکار روزانه (cron میزبان)

```bash
# crontab -e  →  هر شب ۰۳:۰۰
0 3 * * * cd /opt/digital-signage && docker compose exec -T db pg_dump -U signage signage | gzip > backups/db-$(date +\%F).sql.gz && find backups -name 'db-*.sql.gz' -mtime +14 -delete
```

پوشه `backups/` را روی حافظه دیگری (NFS/دیسک دوم) mirror کنید.

## ۴. بازیابی کامل

```bash
# ۱) توقف سرویس‌های مصرف‌کننده (نه db)
docker compose stop api worker scheduler

# ۲) بازیابی دیتابیس
gunzip -c backups/db-2026-01-01-0300.sql.gz | docker compose exec -T db psql -U signage signage

# ۳) بازیابی رسانه‌ها
docker run --rm -v digital-signage_media_data:/data -v "$PWD/backups":/backup \
  alpine sh -c "rm -rf /data/media && tar xzf /backup/media-2026-01-01-0300.tar.gz -C /data"

# ۴) اجرا
docker compose up -d
```

## ۵. حفظ داده هنگام ارتقا/بازسازی کانتینرها

- حجم‌ها (`volumes`) جدا از کانتینرها هستند؛ `docker compose up -d --build` یا حتی `down/up` داده را حذف نمی‌کند.
- **هرگز** `docker compose down -v` روی محیط واقعی اجرا نکنید — `-v` حجم‌ها را حذف می‌کند.
- قبل از هر ارتقای نسخه، یک بکاپ کامل بگیرید.
- مهاجرت‌های دیتابیس در شروع کانتینر api به‌صورت خودکار اجرا می‌شود (`entrypoint.sh`).

## ۶. آزمون بازیابی (الزامی)

هر ۳ ماه یک‌بار روی یک ماشین آزمایشی:
1. بکاپ روزانه را بازگردانید (بخش ۴).
2. ورود به پنل، وجود دستگاه‌ها/برنامه‌ها/محتواها و پخش یک محتوا را بررسی کنید.
3. نتیجه را در `docs/TEST_REPORT.md` ثبت کنید.
