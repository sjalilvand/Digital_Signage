package com.elevatorsignage.player.config

import android.content.Context
import android.content.SharedPreferences

/**
 * تنظیمات پایدار دستگاه (SharedPreferences):
 *  - serverBaseUrl: آدرس سرور (پیش‌فرض شبکه محلی ساختمان)
 *  - deviceId / deviceToken / deviceName: اعتبارنامه اختصاصی دستگاه (قرارداد §1.2)
 *  - pollIntervalSec: فاصله poll از سرور (سرور از طریق manifest تغییرش می‌دهد)
 *
 * توجه: توکن دستگاه فقط همین‌جا ذخیره می‌شود و در هیچ درخواستی بدون هدر
 * «Authorization: Device <token>» استفاده نمی‌شود (AuthInterceptor).
 */
object AppConfig {

    private const val PREFS = "signage_config"
    private const val KEY_SERVER_URL = "server_base_url"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_DEVICE_TOKEN = "device_token"
    private const val KEY_DEVICE_NAME = "device_name"
    private const val KEY_POLL_INTERVAL = "poll_interval_sec"
    private const val KEY_MASTER_VOLUME = "master_volume"

    const val DEFAULT_SERVER_URL = "http://192.168.1.10:8080"
    const val DEFAULT_POLL_INTERVAL_SEC = 15

    @Volatile
    var serverBaseUrl: String = DEFAULT_SERVER_URL
        private set

    @Volatile
    var deviceId: String? = null
        private set

    @Volatile
    var deviceToken: String? = null
        private set

    @Volatile
    var deviceName: String? = null
        private set

    @Volatile
    var pollIntervalSec: Int = DEFAULT_POLL_INTERVAL_SEC

    @Volatile
    var masterVolume: Int = 100

    private lateinit var prefs: SharedPreferences

    /** باید در SignageApplication.onCreate فراخوانی شود. */
    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        serverBaseUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
        deviceId = prefs.getString(KEY_DEVICE_ID, null)
        deviceToken = prefs.getString(KEY_DEVICE_TOKEN, null)
        deviceName = prefs.getString(KEY_DEVICE_NAME, null)
        pollIntervalSec = prefs.getInt(KEY_POLL_INTERVAL, DEFAULT_POLL_INTERVAL_SEC)
        masterVolume = prefs.getInt(KEY_MASTER_VOLUME, 100)
    }

    val isEnrolled: Boolean
        get() = !deviceToken.isNullOrBlank() && !deviceId.isNullOrBlank()

    fun setServerBaseUrl(url: String) {
        serverBaseUrl = url.trim().trimEnd('/')
        prefs.edit().putString(KEY_SERVER_URL, serverBaseUrl).apply()
    }

    fun setEnrolled(id: String, token: String, name: String?) {
        deviceId = id
        deviceToken = token
        deviceName = name ?: deviceName
        prefs.edit()
            .putString(KEY_DEVICE_ID, id)
            .putString(KEY_DEVICE_TOKEN, token)
            .putString(KEY_DEVICE_NAME, deviceName)
            .apply()
    }

    fun setPollInterval(sec: Int) {
        pollIntervalSec = sec.coerceIn(5, 3600)
        prefs.edit().putInt(KEY_POLL_INTERVAL, pollIntervalSec).apply()
    }

    fun setMasterVolume(volume: Int) {
        masterVolume = volume.coerceIn(0, 100)
        prefs.edit().putInt(KEY_MASTER_VOLUME, masterVolume).apply()
    }

    /** قطع دسترسی دستگاه (از پنل) → پاکسازی اعتبارنامه؛ دستگاه دوباره جفت‌سازی می‌کند. */
    fun resetEnrollment() {
        deviceId = null
        deviceToken = null
        prefs.edit().remove(KEY_DEVICE_ID).remove(KEY_DEVICE_TOKEN).apply()
    }

    /**
     * نسخه اپ از PackageManager (بدون نیاز به BuildConfig که در AGP 8 پیش‌فرض خاموش است).
     */
    fun appVersion(context: Context): String = try {
        val pm = context.packageManager.getPackageInfo(context.packageName, 0)
        pm.versionName ?: "1.0.0"
    } catch (_: Exception) {
        "1.0.0"
    }

    /** سازگاری با ارجاع‌های موجود (SyncService) — نسخه اپ بدون context */
    val APP_VERSION: String
        get() = _appVersion ?: "1.0.0"

    @Volatile
    private var _appVersion: String? = null

    fun initAppVersion(context: Context) {
        _appVersion = appVersion(context)
    }
}
