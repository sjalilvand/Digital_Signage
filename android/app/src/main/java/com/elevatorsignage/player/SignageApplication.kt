package com.elevatorsignage.player

import android.app.Application
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.data.local.DatabaseProvider

/**
 * اپلیکیشن نمایشگر آسانسور:
 *  - مقداردهی اولیه Room (پایگاه‌داده محلی برای برنامه نمایش، صف گزارش و وضعیت)
 *  - بارگذاری AppConfig از SharedPreferences
 * اجرای خودکار پس از روشن‌شدن دستگاه از BootReceiver و با سرویس SignageService انجام می‌شود.
 */
class SignageApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        DatabaseProvider.init(this)
        AppConfig.init(this)
        AppConfig.initAppVersion(this)
    }
}
