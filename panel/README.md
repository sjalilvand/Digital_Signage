# پنل مدیریت — سامانه مدیریت نمایشگرهای آسانسور

پنل وب React + TypeScript (Vite) برای مدیریت محتوا، برنامه‌های نمایش، انتشار و دستگاه‌های آسانسور.
زبان رابط: فارسی — چیدمان: RTL — فونت: Vazirmatn.

## اجرای محلی (توسعه)

```bash
cd panel
npm install
npm run dev        # http://localhost:5173
```

در حالت dev، وایت از `/api` و `/device-api` و `/media` به `http://localhost:8000`
و `/ws` به `ws://localhost:8000` پروکسی می‌شود (بخش `server.proxy` در `vite.config.ts`).

اگر سرور Django در جای دیگری است:

```bash
VITE_API_BASE=http://localhost:8000 npm run dev
```

## ساخت نسخه نهایی

```bash
npm run build      # tsc -b && vite build → خروجی در dist/
```

## داکر

`Dockerfile` دو مرحله‌ای است: `node:20-alpine` بیلد می‌کند و `nginx:1.27-alpine`
فقط فایل‌های استاتیک SPA را سرو می‌کند (`panel-nginx.conf`).

**نکته مهم معماری شبکه:** کانتینر پنل خودش هیچ پروکسی‌ای ندارد.
در `docker-compose` پروژه، nginx گیت‌وی همه‌چیز را مسیردهی می‌کند:

```nginx
location /            { proxy_pass http://panel:80; }            # SPA پنل
location /api/        { proxy_pass http://api:8000; }            # REST پنل
location /device-api/ { proxy_pass http://api:8000; }            # REST دستگاه
location /media/      { proxy_pass http://api:8000; }            # فایل‌ها (Range)
location /ws/         { proxy_pass http://api:8000;              # WebSocket داشبورد
                        proxy_http_version 1.1;
                        proxy_set_header Upgrade $http_upgrade;
                        proxy_set_header Connection "upgrade"; }
```

با این طراحی آدرس API پنل same-origin است؛ `src/api.ts` مقدار پیش‌فرض
`VITE_API_BASE = ''` را نگه می‌دارد و نیازی به متغیر محیطی در پروداکشن نیست.

## ساختار

```
panel/
├── src/
│   ├── api.ts              # کلاینت axios + typed helpers همه اندپوینت‌های قرارداد
│   ├── ws.ts               # WebSocket داشبورد با اتصال مجدد + backoff
│   ├── types.ts            # تایپ‌ها مطابق API_CONTRACT.md
│   ├── labels.ts           # برچسب‌های فارسی وضعیت/نوع + helperهای زمان و اندازه
│   ├── store/              # zustand (auth با persist در localStorage 'auth'، toast)
│   ├── components/ui.tsx   # کیت رابط کاربری (Button, Card, Badge, Modal, …)
│   ├── pages/              # Login, Dashboard, Library, Playlists, Publishing,
│   │                       # Devices, Reports, Users, Settings
│   └── App.tsx             # شِل اپ (سایدبار راست، گاردهای نقش)
├── Dockerfile              # بیلد دو مرحله‌ای → nginx استاتیک
└── panel-nginx.conf        # سرو SPA
```

## نکات عملکردی مطابق SRS

- داشبورد: WebSocket `/ws/dashboard/?token=JWT` با رویدادهای `device.updated` /
  `deployment.updated` + fallback polling هر ۱۰ ثانیه (هر دو فعال‌اند).
- بارگذاری ≠ انتشار — پس از بارگذاری، وضعیت محتوا هر ۲ ثانیه poll می‌شود تا
  `ready`/`failed` (سقف ۵ دقیقه).
- برای دستگاه آفلاین برچسب «آخرین وضعیت گزارش‌شده» نمایش داده می‌شود.
- «اطلاعیه فوری به دستگاه قطع‌شده از شبکه فوراً نمی‌رسد؛ پس از بازگشت ارتباط
  دریافت می‌شود.» — هشدار هنگام انتشار با اولویت بالا.
