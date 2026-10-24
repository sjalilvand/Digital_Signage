package com.elevatorsignage.player

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.config.FirstRunActivity
import com.elevatorsignage.player.player.PlaybackStateHolder
import com.elevatorsignage.player.player.PlayerController
import com.elevatorsignage.player.sync.SyncService
import com.elevatorsignage.player.util.NetWatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * فعالیت اصلی — حالت کیوسک:
 *  - تمام‌صفحه و غوطه‌ور (immersive sticky) + روشن‌ماندن صفحه
 *  - خروج/بازگشت غیرفعال (جلوگیری از خروج از برنامه)
 *  - اگر دستگاه جفت‌نشده باشد → FirstRunActivity
 *  - PlayerController پخش را از حافظه محلی اجرا می‌کند (قطع Wi-Fi پخش را متوقف نمی‌کند)
 *  - SyncService پیش‌زمینه: poll دوره‌ای + دانلود + گزارش (§4)
 */
class MainActivity : AppCompatActivity() {

    private var controller: PlayerController? = null
    private var networkJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!AppConfig.isEnrolled) {
            startActivity(Intent(this, FirstRunActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_main)

        // کیوسک: صفحه همیشه روشن + تمام‌صفحه
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        // شروع سرویس پیش‌زمینه همگام‌سازی (idempotent)
        val serviceIntent = Intent(this, SyncService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        setupController()
        observeNetwork()
    }

    private fun setupController() {
        val views = PlayerController.Views(
            playerView = findViewById(R.id.player_view),
            imageView = findViewById(R.id.image_view),
            audioView = findViewById(R.id.audio_view),
            audioTitle = findViewById(R.id.audio_title),
            pdfView = findViewById(R.id.pdf_view),
            webView = findViewById(R.id.html_web_view),
            textContainer = findViewById(R.id.text_container),
            textTitle = findViewById(R.id.text_title),
            textBody = findViewById(R.id.text_body),
            textImage = findViewById(R.id.text_image),
            idleView = findViewById(R.id.idle_view),
            bootLoading = findViewById(R.id.boot_loading),
            statusOverlay = findViewById(R.id.status_overlay)
        )
        controller = PlayerController(this, views, lifecycleScope).also {
            PlaybackStateHolder.controller = it
            it.start()
        }
    }

    private fun observeNetwork() {
        val overlay = findViewById<TextView>(R.id.status_overlay)
        networkJob = lifecycleScope.launch {
            NetWatcher.observe(applicationContext).collect { online ->
                if (online) {
                    overlay.visibility = View.GONE
                } else {
                    // قطع Wi-Fi: پخش از حافظه محلی ادامه دارد؛ فقط اطلاع‌رسانی می‌کنیم
                    overlay.text = getString(R.string.offline_badge)
                    overlay.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.hide(WindowInsetsCompat.Type.systemBars())
        insetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // حالت کیوسک — خروج از برنامه مجاز نیست
    }

    override fun onPause() {
        controller?.onActivityPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        controller?.onActivityResume()
    }

    override fun onDestroy() {
        networkJob?.cancel()
        // releases players + views (activity-scoped)
        controller?.release()
        PlaybackStateHolder.controller = null
        super.onDestroy()
    }
}
