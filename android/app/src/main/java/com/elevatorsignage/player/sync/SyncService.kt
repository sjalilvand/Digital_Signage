package com.elevatorsignage.player.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.StatFs
import android.util.Log
import androidx.core.app.NotificationCompat
import com.elevatorsignage.player.R
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.data.local.DatabaseProvider
import com.elevatorsignage.player.data.local.DeviceStateEntity
import com.elevatorsignage.player.data.local.PendingReport
import com.elevatorsignage.player.data.remote.AckRequest
import com.elevatorsignage.player.data.remote.ApiService
import com.elevatorsignage.player.data.remote.DeploymentReport
import com.elevatorsignage.player.data.remote.ManifestResponse
import com.elevatorsignage.player.data.remote.PlaybackReport
import com.elevatorsignage.player.data.remote.PlayingReport
import com.elevatorsignage.player.data.remote.RetrofitClient
import com.elevatorsignage.player.data.remote.StatusReport
import com.elevatorsignage.player.player.PlaybackStateHolder
import com.elevatorsignage.player.util.NetWatcher
import com.elevatorsignage.player.util.TimeSync
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * سرویس پیش‌زمینه همگام‌سازی (channel «پخش محتوا»، اهمیت کم):
 *  - هر poll_interval_sec یک بار manifest (قطع شبکه → پخش ادامه دارد و فقط fetch skip می‌شود)
 *  - همگام‌سازی صف دانلود + گزارش وضعیت + flush صف گزارش‌ها + اجرای فرمان‌ها + ack
 *  - ذخیره آخرین manifest در Room برای بازسازی فوری برنامه پس از ری‌بوت آفلاین
 */
class SyncService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val gson = Gson()
    private val db by lazy { DatabaseProvider.get() }
    private var downloader: Downloader? = null
    private var loopJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundWithNotification()
        if (downloader == null) {
            downloader = Downloader(applicationContext, scope)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (loopJob?.isActive != true) {
            loopJob = scope.launch { syncLoop() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        loopJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private fun startForegroundWithNotification() {
        val channelId = "signage_playback"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                channelId,
                getString(R.string.notif_channel),
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.logo)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private suspend fun syncLoop() {
        var delaySec = AppConfig.pollIntervalSec.coerceAtLeast(3)
        while (currentCoroutineContext().isActive) {
            val online = NetWatcher.isOnline(applicationContext)
            var ok = false
            if (online) {
                ok = try {
                    pollOnce()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "pollOnce failed: ${e.message}")
                    false
                }
            }
            // رفت‌وبرگشت offline→online: اولین گزارش موفق، last_seen سرور را تازه می‌کند
            delaySec = when {
                ok -> AppConfig.pollIntervalSec.coerceAtLeast(3)
                online -> (delaySec * 2).coerceAtMost(MAX_BACKOFF_SEC)
                else -> (delaySec * 2).coerceAtMost(MAX_BACKOFF_SEC)
            }
            delay(delaySec * 1000L)
        }
    }

    /** یک چرخه کامل: manifest → همگام‌سازی → فرمان‌ها → flush گزارش‌ها → report/status */
    private suspend fun pollOnce(): Boolean {
        val api = RetrofitClient.api()
        val response = try {
            api.getManifest()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return false
        }
        if (!response.isSuccessful) return false
        val manifest = response.body() ?: return false

        TimeSync.updateFromServer(manifest.serverTime)
        manifest.pollIntervalSec?.let { AppConfig.setPollInterval(it) }
        PlaybackStateHolder.manifest = manifest
        persistState(manifest)

        val dl = downloader ?: return false
        dl.reconcile(manifest)
        dl.startWorker()

        processCommands(manifest)

        flushPendingStatusReports(api)
        flushPlaybackReports(api)
        sendStatusReport(api, manifest, dl)
        return true
    }

    private suspend fun processCommands(manifest: ManifestResponse) {
        val api = RetrofitClient.api()
        val dl = downloader ?: return
        for (command in manifest.commands.orEmpty()) {
            val result: String = try {
                when (command.action) {
                    "set_volume", "pause_playback", "resume_playback" -> {
                        val controller = PlaybackStateHolder.controller
                        if (controller == null) {
                            "error: player not ready"
                        } else {
                            withContext(Dispatchers.Main) { controller.handleCommand(command) }
                        }
                    }
                    "cleanup_files" -> {
                        val keep = manifest.versions.orEmpty().map { it.versionId }.toSet() +
                            setOfNotNull(PlaybackStateHolder.playingVersionId)
                        val freed = dl.cleanup(keep)
                        "ok: $freed files freed"
                    }
                    "cancel_pending" -> {
                        dl.cancelPending(manifest)
                        "ok"
                    }
                    else -> "ok" // refresh_status / rollback → در چرخه بعدی گزارش می‌شود
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                "error: ${e.message}"
            }
            val ack = AckRequest(command.id, result)
            val ackSent = try {
                api.ackCommand(ack).isSuccessful
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                false
            }
            if (!ackSent) {
                enqueuePendingReport("ack", gson.toJson(ack))
            }
        }
    }

    private suspend fun sendStatusReport(api: ApiService, manifest: ManifestResponse, dl: Downloader) {
        val deployments = manifest.versions.orEmpty().map { version ->
            if (version.versionId == PlaybackStateHolder.playingVersionId) {
                DeploymentReport(
                    deploymentId = version.deploymentId,
                    status = "active",
                    progress = null,
                    error = null
                )
            } else {
                val state = dl.deploymentState(
                    version.versionId,
                    version.items.orEmpty().sumOf { it.files.orEmpty().size }
                )
                DeploymentReport(
                    deploymentId = version.deploymentId,
                    status = state.status,
                    progress = state.progress,
                    error = state.error
                )
            }
        }
        val playing = PlaybackStateHolder.playingVersionId?.let { versionId ->
            PlayingReport(
                versionId = versionId,
                itemOrder = PlaybackStateHolder.playingItemOrder,
                contentId = PlaybackStateHolder.playingContentId ?: "",
                startedAt = TimeSync.toIso(PlaybackStateHolder.playingStartedAtMs)
            )
        }
        val report = StatusReport(
            appVersion = AppConfig.APP_VERSION,
            androidVersion = Build.VERSION.RELEASE,
            model = Build.MODEL,
            freeSpaceMb = freeSpaceMb(),
            network = if (NetWatcher.isOnline(applicationContext)) "wifi" else "disconnected",
            deployments = deployments,
            playing = playing
        )
        val sent = try {
            api.reportStatus(report).isSuccessful
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
        if (!sent) {
            enqueuePendingReport("status", gson.toJson(report))
        }
    }

    /** صف گزارش پخش §4.3 — ارسال batch تا ۵۰ گزارش */
    private suspend fun flushPlaybackReports(api: ApiService) {
        val pending = db.playbackLogDao().pending(50)
        if (pending.isEmpty()) return
        val reports = pending.map { log ->
            PlaybackReport(
                versionId = log.versionId,
                deploymentId = log.deploymentId,
                contentId = log.contentId,
                startedAt = TimeSync.toIso(log.startedAtEpochMs),
                durationSec = log.durationSec,
                completed = log.completed,
                error = log.error
            )
        }
        val sent = try {
            api.reportPlayback(reports).isSuccessful
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            false
        }
        if (sent) {
            db.playbackLogDao().markSynced(pending.map { it.id })
            db.playbackLogDao().purgeSynced(TimeSync.now() - 7L * 24L * 3600L * 1000L)
        }
    }

    /** flush صف status/ack که قبلاً ارسال نشده بودند (به ترتیب) */
    private suspend fun flushPendingStatusReports(api: ApiService) {
        while (true) {
            val batch = db.reportQueueDao().oldest(10)
            if (batch.isEmpty()) return
            var allSent = true
            for (item in batch) {
                val ok = try {
                    when (item.type) {
                        "status" -> api.reportStatus(
                            gson.fromJson(item.payloadJson, StatusReport::class.java)
                        ).isSuccessful
                        "ack" -> api.ackCommand(
                            gson.fromJson(item.payloadJson, AckRequest::class.java)
                        ).isSuccessful
                        else -> true
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    false
                }
                if (ok) {
                    db.reportQueueDao().delete(item)
                } else {
                    allSent = false
                    break
                }
            }
            if (!allSent) return
        }
    }

    private suspend fun enqueuePendingReport(type: String, payloadJson: String) =
        withContext(Dispatchers.IO) {
            db.reportQueueDao().insert(
                PendingReport(type = type, payloadJson = payloadJson)
            )
            db.reportQueueDao().trim(200)
        }

    private suspend fun persistState(manifest: ManifestResponse) = withContext(Dispatchers.IO) {
        val state = db.stateDao().get() ?: DeviceStateEntity()
        db.stateDao().put(
            state.copy(
                currentVersionId = PlaybackStateHolder.playingVersionId ?: state.currentVersionId,
                lastManifestJson = gson.toJson(manifest),
                paused = PlaybackStateHolder.paused,
                volume = PlaybackStateHolder.masterVolume,
                serverTimeOffsetMs = TimeSync.offsetMs,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    private fun freeSpaceMb(): Long = try {
        StatFs(filesDir.path).availableBytes / (1024L * 1024L)
    } catch (e: Exception) {
        0L
    }

    companion object {
        private const val TAG = "SyncService"
        private const val NOTIFICATION_ID = 1001
        private const val MAX_BACKOFF_SEC = 300
    }
}
