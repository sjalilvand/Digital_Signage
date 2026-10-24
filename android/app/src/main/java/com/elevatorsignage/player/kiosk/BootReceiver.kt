package com.elevatorsignage.player.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.elevatorsignage.player.MainActivity
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.sync.SyncService

/**
 * اجرای خودکار پس از روشن‌شدن باکس (قطع/وصل برق — SRS §13):
 *  - فقط اگر دستگاه جفت‌سازی شده باشد
 *  - شروع سرویس پیش‌زمینه (BOOT_COMPLETED از استثناهای محدودیت FGS است)
 *  - باز کردن فعالیت اصلی (FLAG_ACTIVITY_NEW_TASK)
 *
 * نکته استقرار: برای تضمین کامل حالت کیوسک، روی برخی باکس‌ها باید برنامه به‌عنوان
 * لانچر پیش‌فرض/Home تنظیم شود یا از Screen Pinning استفاده شود (android/README.md).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != "android.intent.action.QUICKBOOT_POWERON") {
            return
        }
        if (!AppConfig.isEnrolled) {
            Log.w(TAG, "دستگاه هنوز جفت‌سازی نشده؛ اجرای خودکار رد شد")
            return
        }
        try {
            val service = Intent(context, SyncService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service)
            } else {
                context.startService(service)
            }
            val main = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(main)
        } catch (e: Exception) {
            Log.e(TAG, "اجرای خودکار پس از بوت ناموفق بود", e)
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
