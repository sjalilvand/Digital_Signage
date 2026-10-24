# اپلیکیشن اندروید نمایشگر آسانسور (ElevatorSignage)

اپلیکیشن Kotlin برای باکس‌های Android TV نصب‌شده داخل آسانسور؛ بخشی از سیستم Digital Signage.
معماری **Offline-First**: محتوا از طریق Wi-Fi دانلود و همیشه از حافظه محلی پخش می‌شود؛
قطع شدن Wi-Fi هیچ‌گاه پخش را متوقف نمی‌کند و صفحه سیاه نشان نمی‌دهد.

## ساخت پروژه (Build)

فایل `gradlew` (wrapper) در این مخزن تولید نشده است (فایل باینری `gradle-wrapper.jar` قابل تولید متنی نیست).
دو راه برای ساخت APK:

1. **Android Studio** (پیشنهادی): پوشه `android/` را باز کنید — Studio خودش wrapper را تولید و Gradle 8.2 را دانلود می‌کند، سپس `Build > Generate Signed APK` یا `./gradlew assembleRelease`.
2. **خط فرمان**: اگر Gradle نصب دارید، یک‌بار داخل همین پوشه اجرا کنید:
   ```
   gradle wrapper --gradle-version 8.2
   ./gradlew assembleDebug
   ```
   نسخه‌های موردنیاز: AGP 8.2.2 ، Kotlin 1.9.22 ، JDK 17 ، compileSdk 34.

## امضای Release

فایل `keystore.properties.example` را به `keystore.properties` کپی کنید و مقادیر واقعی را بدهید.
اگر `keystore.properties` وجود نداشته باشد، build release با امضای debug ساخته می‌شود.

## نکات مهم

- **Cleartext HTTP**: سرور روی LAN با HTTP ساده سرو می‌شود؛ بنابراین `android:usesCleartextTraffic="true"` در Manifest فعال است. (محدود به شبکه محلی — ترافیک رمزنشده به اینترنت عمومی استفاده نمی‌شود.)
- **Kiosk**: `MainActivity` تمام‌صفحه و sticky-immersive است، دکمه Back کاری نمی‌کند و `BootReceiver` پس از روشن‌شدن دستگاه، سرویس و اپ را اجرا می‌کند (فقط اگر دستگاه enroll شده باشد).
- **Off-first**: آخرین manifest به‌صورت JSON در Room ذخیره می‌شود؛ پس از ری‌بوت و بدون شبکه، همان برنامه قبلی بلافاصله پخش می‌شود.
- **انتخاب نسخه (قرارداد §4.1)**:
  1. نسخه `high` یا `immediate` آماده و داخل بازه
  2. نسخه‌های `scheduled/recurring/expiry` داخل بازه (با آفست ساعت سرور از `server_time`)
  3. نسخه پیش‌فرض = قدیمی‌ترین نسخه فعال بدون `end_at` (کمترین `version_no`) — مطابق قرارداد.
  نسخه ناقص (حتی یک فایل ناقص) هرگز فعال نمی‌شود؛ تا آماده‌شدن کامل، نسخه قبلی ادامه دارد.
- **دانلود قابل ازسرگیری**: با `Range: bytes=N-` (پاسخ 206 ادامه، 200 شروع مجدد)، هش SHA-256 استریم‌شده (شامل بخش از قبل دانلودشده) و مقایسه سایز بررسی می‌شود؛ فایل `.part` بعد از تأیید rename می‌شود.
- **HTML**: بسته zip محتوا در اولین پخش به `files/content/<version>/<content>/html_extracted/` استخراج می‌شود (با محافظت path-traversal). WebView فقط `file:` ، `data:` و `blob:` را مجاز می‌داند؛ پنجره جدید، دانلود و Geolocation مسدود است.
- **گزارش‌ها**: وضعیت دستگاه هر `poll_interval_sec` و گزارش پخش به‌صورت batch ارسال می‌شود؛ گزارش‌های ناموفق در Room صف می‌شوند و بعداً flush می‌گردند (`/report/playback/` آرایه هم می‌پذیرد — §4.3).
- **فرمان‌ها**: `set_volume` / `pause_playback` / `resume_playback` روی PlayerController و `refresh_status` / `cancel_pending` / `rollback` / `cleanup_files` روی سرویس اجرا و با `POST /ack/command/` تأیید می‌شوند.

## ساختار پوشه‌ها

```
app/src/main/java/com/elevatorsignage/player/
├── SignageApplication.kt      ← init Room + Coil
├── MainActivity.kt            ← kiosk fullscreen + اتصال PlayerController
├── config/                    ← AppConfig (SharedPreferences) + FirstRunActivity (جفت‌سازی)
├── data/remote/               ← Retrofit ApiService + DTOهای قرارداد + AuthInterceptor
├── data/local/                ← Room (downloads, pending_reports, device_state, playback_log)
├── sync/                      ← SyncService (حلقه polling) + Downloader (Range + SHA-256)
├── player/                    ← PlayerController (۶ نوع محتوا) + PlaybackStateHolder
├── kiosk/                     ← BootReceiver
└── util/                      ← NetWatcher، Hashing، TimeSync، ContentPaths، Persian
```

## مسیر فایل‌های محلی

`<filesDir>/content/<versionId>/<contentId>/<role>[_<page>]` — پس از تکمیل و تأیید هش از `.part` تغییرنام می‌یابد.
