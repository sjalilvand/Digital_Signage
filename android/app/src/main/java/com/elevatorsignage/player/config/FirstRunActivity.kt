package com.elevatorsignage.player.config

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.elevatorsignage.player.MainActivity
import com.elevatorsignage.player.R
import com.elevatorsignage.player.data.remote.EnrollRequest
import com.elevatorsignage.player.data.remote.RetrofitClient
import com.elevatorsignage.player.util.TimeSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * صفحه جفت‌سازی یک‌بارمصرف (قرارداد §1.2):
 * مدیر از پنل «کد جفت‌سازی» می‌گیرد، اینجا آدرس سرور + کد وارد می‌شود؛
 * سرور توکن اختصاصی دستگاه را صادر می‌کند و پس از آن این صفحه دیگر باز نمی‌شود.
 */
class FirstRunActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var enrollJob: Job? = null

    private lateinit var serverUrlInput: EditText
    private lateinit var pairingCodeInput: EditText
    private lateinit var connectButton: Button
    private lateinit var connectProgress: ProgressBar
    private lateinit var errorText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_first_run)

        serverUrlInput = findViewById(R.id.server_url_input)
        pairingCodeInput = findViewById(R.id.pairing_code_input)
        connectButton = findViewById(R.id.connect_button)
        connectProgress = findViewById(R.id.connect_progress)
        errorText = findViewById(R.id.error_text)

        serverUrlInput.setText(AppConfig.serverBaseUrl)
        connectButton.setOnClickListener { startEnroll() }
    }

    private fun startEnroll() {
        val url = serverUrlInput.text.toString().trim()
        val code = pairingCodeInput.text.toString().trim().uppercase()

        errorText.visibility = View.GONE

        if (!isValidUrl(url)) {
            showError(getString(R.string.pairing_invalid_url))
            return
        }
        if (code.isEmpty()) {
            showError(getString(R.string.pairing_invalid_code))
            return
        }

        // آدرس قبل از ساخت Retrofit ذخیره شود تا RetrofitClient با آدرس جدید ساخته شود
        AppConfig.setServerBaseUrl(url)
        setBusy(true)

        enrollJob = scope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.api().enroll(EnrollRequest(pairing_code = code))
                }
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    AppConfig.setEnrolled(body.deviceId, body.deviceToken, body.deviceName)
                    body.pollIntervalSec?.let { AppConfig.setPollInterval(it) }
                    body.serverTime?.let { TimeSync.updateFromServer(it) }
                    // ورود به صفحه اصلی و شروع سرویس همگام‌سازی
                    startActivity(Intent(this@FirstRunActivity, MainActivity::class.java))
                    finish()
                } else {
                    showError(
                        if (response.code() == 400 || response.code() == 403) {
                            getString(R.string.pairing_invalid_code)
                        } else {
                            getString(R.string.pairing_network_error)
                        }
                    )
                }
            } catch (_: Exception) {
                showError(getString(R.string.pairing_network_error))
            } finally {
                setBusy(false)
            }
        }
    }

    private fun setBusy(busy: Boolean) {
        connectButton.isEnabled = !busy
        connectProgress.visibility = if (busy) View.VISIBLE else View.GONE
        serverUrlInput.isEnabled = !busy
        pairingCodeInput.isEnabled = !busy
    }

    private fun showError(message: String) {
        errorText.text = message
        errorText.visibility = View.VISIBLE
    }

    private fun isValidUrl(url: String): Boolean = try {
        val parsed = java.net.URL(url)
        (parsed.protocol == "http" || parsed.protocol == "https") && parsed.host.isNotBlank()
    } catch (_: Exception) {
        false
    }

    override fun onDestroy() {
        enrollJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }
}
