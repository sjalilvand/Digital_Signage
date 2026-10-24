package com.elevatorsignage.player.player

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.load
import com.elevatorsignage.player.R
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.data.local.DatabaseProvider
import com.elevatorsignage.player.data.local.DownloadEntity
import com.elevatorsignage.player.data.local.PlaybackLogEntity
import com.elevatorsignage.player.data.remote.CommandDto
import com.elevatorsignage.player.data.remote.ManifestResponse
import com.elevatorsignage.player.data.remote.PlaylistItemDto
import com.elevatorsignage.player.data.remote.ScheduleDto
import com.elevatorsignage.player.data.remote.VersionManifest
import com.elevatorsignage.player.util.ContentPaths
import com.elevatorsignage.player.util.TimeSync
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.io.File
import java.util.Calendar
import java.util.zip.ZipInputStream

/**
 * قلب پخش: انتخاب نسخه بر اساس §4.1، پخش ۶ نوع محتوا از فایل‌های محلی،
 * گزارش پخش در Room و «هرگز صفحه سیاه» — خطا → ۲ ثانیه صبر → آیتم بعدی.
 */
class PlayerController(
    private val context: Context,
    private val views: Views,
    private val scope: kotlinx.coroutines.CoroutineScope
) {

    data class Views(
        val playerView: PlayerView,
        val imageView: ImageView,
        val audioView: View,
        val audioTitle: TextView,
        val pdfView: ImageView,
        val webView: WebView,
        val textContainer: View,
        val textTitle: TextView,
        val textBody: TextView,
        val textImage: ImageView,
        val idleView: TextView,
        val bootLoading: TextView,
        val statusOverlay: TextView
    )

    private val appContext = context.applicationContext
    private val db = DatabaseProvider.get()
    private val gson = Gson()

    private var exoPlayer: ExoPlayer? = null
    private var loopJob: Job? = null
    private var started = false

    @Volatile
    private var itemCompletion: CompletableDeferred<Boolean>? = null

    private var currentVersionId: String? = null
    private var currentItem: PlaylistItemDto? = null
    private var itemIndex = 0

    init {
        prepareWebView()
    }

    // ------------------------------------------------------------------
    // چرخه حیات
    // ------------------------------------------------------------------

    fun start() {
        if (started) return
        started = true
        PlaybackStateHolder.controller = this
        loopJob = scope.launch {
            restoreState()
            runLoop()
        }
    }

    fun onActivityPause() {
        exoPlayer?.pause()
    }

    fun onActivityResume() {
        if (!PlaybackStateHolder.paused) {
            exoPlayer?.play()
        }
    }

    fun release() {
        loopJob?.cancel()
        loopJob = null
        itemCompletion?.complete(false)
        itemCompletion = null
        exoPlayer?.release()
        exoPlayer = null
        views.playerView.player = null
        try {
            views.webView.stopLoading()
            (views.webView.parent as? ViewGroup)?.removeView(views.webView)
            views.webView.destroy()
        } catch (e: Exception) {
            // نادیده گرفتن
        }
        if (PlaybackStateHolder.controller === this) {
            PlaybackStateHolder.controller = null
        }
        started = false
    }

    private suspend fun restoreState() = withContext(Dispatchers.IO) {
        val state = db.stateDao().get()
        if (state != null) {
            PlaybackStateHolder.paused = state.paused
            PlaybackStateHolder.masterVolume = state.volume
            TimeSync.offsetMs = state.serverTimeOffsetMs
            if (PlaybackStateHolder.manifest == null && state.lastManifestJson != null) {
                try {
                    PlaybackStateHolder.manifest = gson.fromJson(
                        state.lastManifestJson,
                        ManifestResponse::class.java
                    )
                } catch (e: Exception) {
                    // JSON خراب — نادیده گرفته می‌شود
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // حلقه اصلی پخش
    // ------------------------------------------------------------------

    private suspend fun runLoop() {
        while (currentCoroutineContext().isActive) {
            try {
                if (PlaybackStateHolder.paused) {
                    exoPlayer?.pause()
                    delay(500)
                    continue
                }
                val version = selectVersion()
                if (version == null) {
                    PlaybackStateHolder.clearPlaying()
                    showIdle()
                    delay(2000)
                    continue
                }
                if (version.versionId != currentVersionId) {
                    currentVersionId = version.versionId
                    itemIndex = 0
                    stopPlatformPlayers()
                }
                val items = version.items.orEmpty().sortedBy { it.order }
                if (items.isEmpty()) {
                    PlaybackStateHolder.clearPlaying()
                    showIdle()
                    delay(2000)
                    continue
                }
                val item = items[Math.floorMod(itemIndex, items.size)]
                playItem(version, item)
                itemIndex++
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                delay(2000)
            }
        }
    }

    private suspend fun playItem(version: VersionManifest, item: PlaylistItemDto) {
        val startedAtMs = TimeSync.now()
        PlaybackStateHolder.playingVersionId = version.versionId
        PlaybackStateHolder.playingDeploymentId = version.deploymentId
        PlaybackStateHolder.playingItemOrder = item.order
        PlaybackStateHolder.playingContentId = item.contentId
        PlaybackStateHolder.playingStartedAtMs = startedAtMs
        currentItem = item

        val completion = CompletableDeferred<Boolean>()
        itemCompletion = completion

        var completed = false
        var error: String? = null
        try {
            when (item.type) {
                "video" -> playVideo(version, item, completion)
                "audio" -> playAudio(version, item, completion)
                "image" -> playImage(version, item, completion)
                "pdf" -> playPdf(version, item, completion)
                "html" -> playHtml(version, item, completion)
                "text" -> playText(version, item, completion)
                else -> {
                    showIdle()
                    delay(2000)
                    completion.complete(true)
                }
            }
            completed = completion.await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message ?: "خطای ناشناخته پخش"
        } finally {
            itemCompletion = null
        }

        val durationSec = (TimeSync.now() - startedAtMs) / 1000.0
        if (!completed) {
            error = error ?: "پخش ناموفق — رفتن به آیتم بعدی"
            delay(2000) // هرگز صفحه سیاه: ۲ ثانیه صبر و سپس آیتم بعدی
        }
        writePlaybackLog(version, item, startedAtMs, durationSec, completed, error)
        currentItem = null
    }

    // ------------------------------------------------------------------
    // انتخاب نسخه (قرارداد §4.1)
    // ------------------------------------------------------------------

    private suspend fun selectVersion(): VersionManifest? {
        val manifest = PlaybackStateHolder.manifest ?: return null
        val now = TimeSync.now()
        val ready = manifest.versions.orEmpty().filter { isVersionReady(it) }
        if (ready.isEmpty()) return null

        // قاعده ۱: high یا immediate و داخل بازه
        ready.filter { it.priority == "high" || it.schedule?.type == "immediate" }
            .filter { inWindow(it.schedule, now) }
            .maxByOrNull { it.versionNo }
            ?.let { return it }

        // قاعده ۲: scheduled / recurring / expiry داخل بازه
        ready.filter {
            it.schedule?.type == "scheduled" ||
                it.schedule?.type == "recurring" ||
                it.schedule?.type == "expiry"
        }
            .filter { inWindow(it.schedule, now) }
            .maxByOrNull { it.versionNo }
            ?.let { return it }

        // قاعده ۳: پیش‌فرض = قدیمی‌ترین فعال بدون پایان اعتبار (کمترین version_no)
        return ready.filter { it.schedule?.endAt == null && it.schedule?.type != "recurring" }
            .filter { v ->
                val start = v.schedule?.startAt?.let { TimeSync.parseIso(it) } ?: 0L
                start <= now
            }
            .minByOrNull { it.versionNo }
    }

    private suspend fun isVersionReady(version: VersionManifest): Boolean {
        val files = version.items.orEmpty().flatMap { it.files.orEmpty() }
        if (files.isEmpty()) return true // نسخه بدون فایل (مثلاً فقط متن)
        val rows = withContext(Dispatchers.IO) { db.downloadDao().forVersion(version.versionId) }
        if (rows.isEmpty()) return false
        val doneRows = rows.filter { it.status == DownloadEntity.STATUS_DONE }
        if (doneRows.size < files.size) return false
        // بررسی ارزان: فایل موجود و سایز درست (هش کامل فقط هنگام دانلود بررسی شده)
        for (row in doneRows) {
            val file = File(row.filePath)
            if (!file.exists() || file.length() != row.expectedSize) return false
        }
        return true
    }

    private fun inWindow(schedule: ScheduleDto?, now: Long): Boolean {
        if (schedule == null) return true
        schedule.startAt?.let { startIso ->
            val start = TimeSync.parseIso(startIso)
            if (start != null && now < start) return false
        }
        schedule.endAt?.let { endIso ->
            val end = TimeSync.parseIso(endIso)
            if (end != null && now > end) return false
        }
        if (schedule.type == "recurring") {
            val recurrence = schedule.recurrence ?: "none"
            if (recurrence == "weekly") {
                val days = schedule.daysOfWeek.orEmpty()
                if (days.isNotEmpty() && !days.contains(todayIndex(now))) return false
            }
            schedule.timeOfDay?.let { timeOfDay ->
                val dayStart = startOfDay(now)
                if (now < dayStart + parseTimeOfDay(timeOfDay)) return false
            }
        }
        return true
    }

    /** 0=شنبه … 6=جمعه (مطابق قرارداد days_of_week) */
    private fun todayIndex(nowMs: Long): Int {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = nowMs
        return calendar.get(Calendar.DAY_OF_WEEK) % 7
    }

    private fun startOfDay(nowMs: Long): Long {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = nowMs
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }

    private fun parseTimeOfDay(timeOfDay: String): Long {
        val parts = timeOfDay.split(":")
        val hour = parts.getOrNull(0)?.trim()?.toIntOrNull() ?: 0
        val minute = parts.getOrNull(1)?.trim()?.toIntOrNull() ?: 0
        return (hour * 3600L + minute * 60L) * 1000L
    }

    // ------------------------------------------------------------------
    // پخش انواع محتوا (همه از فایل محلی)
    // ------------------------------------------------------------------

    private suspend fun localFile(
        version: VersionManifest,
        item: PlaylistItemDto,
        role: String,
        page: Int? = null
    ): File? = withContext(Dispatchers.IO) {
        val row = db.downloadDao().find(version.versionId, item.contentId, role, page)
        val file = row?.let { File(it.filePath) }
        if (file != null && file.exists() && file.length() > 0) file else null
    }

    private suspend fun playVideo(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val file = localFile(version, item, "original")
        if (file == null) {
            completion.complete(false)
            return
        }
        val player = ensurePlayer()
        views.audioView.setBackgroundColor(parseColor(item.backgroundColor, Color.BLACK))
        showOnly(views.playerView)
        views.playerView.resizeMode = resizeModeFor(item.fitMode)
        val builder = MediaItem.Builder().setUri(Uri.fromFile(file))
        item.durationSec?.let { seconds ->
            if (seconds > 0) {
                builder.setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setEndPositionMs((seconds * 1000).toLong())
                        .build()
                )
            }
        }
        player.setMediaItem(builder.build())
        player.prepare()
        player.volume = if (item.mute == true) 0f else volumeFor(item)
        player.playWhenReady = true
        player.play()
    }

    private suspend fun playAudio(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val file = localFile(version, item, "original")
        if (file == null) {
            completion.complete(false)
            return
        }
        val player = ensurePlayer()
        views.audioTitle.text = item.contentName ?: ""
        views.audioView.setBackgroundColor(parseColor(item.backgroundColor, Color.BLACK))
        showOnly(views.audioView, views.playerView) // PlayerView زیرین برای صدا کافی است
        val builder = MediaItem.Builder().setUri(Uri.fromFile(file))
        item.durationSec?.let { seconds ->
            if (seconds > 0) {
                builder.setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setEndPositionMs((seconds * 1000).toLong())
                        .build()
                )
            }
        }
        player.setMediaItem(builder.build())
        player.prepare()
        player.volume = if (item.mute == true) 0f else volumeFor(item)
        player.playWhenReady = true
        player.play()
    }

    private suspend fun playImage(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val file = localFile(version, item, "original")
        if (file == null) {
            completion.complete(false)
            return
        }
        views.imageView.scaleType = scaleTypeFor(item.fitMode)
        views.imageView.setBackgroundColor(parseColor(item.backgroundColor, Color.BLACK))
        views.imageView.load(file)
        showOnly(views.imageView)
        val durationMs = ((item.durationSec ?: 10.0).coerceAtLeast(1.0) * 1000).toLong()
        pauseAwareDelay(durationMs)
        completion.complete(true)
    }

    private suspend fun playPdf(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val pageRefs = item.files.orEmpty()
            .filter { it.role == "pdf_page" }
            .sortedBy { it.page ?: 0 }
        val wanted = item.pdfPages
        val selected = if (wanted.isNullOrEmpty()) pageRefs
        else pageRefs.filter { wanted.contains(it.page) }
        if (selected.isEmpty()) {
            completion.complete(false)
            return
        }
        val pageFiles: List<File> = withContext(Dispatchers.IO) {
            selected.mapNotNull { ref ->
                val row = db.downloadDao()
                    .find(version.versionId, item.contentId, ref.role, ref.page)
                val file = row?.let { File(it.filePath) }
                if (file != null && file.exists() && file.length() > 0) file else null
            }
        }
        if (pageFiles.isEmpty()) {
            completion.complete(false)
            return
        }
        val secondsPerPage = (item.pdfSecondsPerPage ?: 10.0).coerceAtLeast(1.0)
        val repeats = (item.repeatCount ?: 1).coerceAtLeast(1)
        views.pdfView.scaleType = scaleTypeFor(item.fitMode)
        views.pdfView.setBackgroundColor(parseColor(item.backgroundColor, Color.BLACK))
        showOnly(views.pdfView)
        var completedAll = true
        pages@ for (repeatIndex in 0 until repeats) {
            for (pageFile in pageFiles) {
                if (!currentCoroutineContext().isActive) {
                    completedAll = false
                    break@pages
                }
                views.pdfView.load(pageFile)
                pauseAwareDelay((secondsPerPage * 1000).toLong())
            }
        }
        completion.complete(completedAll)
    }

    private suspend fun playHtml(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val baseDir = ContentPaths.contentDir(appContext.filesDir, version.versionId, item.contentId)
        val extractDir = File(baseDir, "html_extracted")
        val zipFile = localFile(version, item, "original")
        if (zipFile != null) {
            extractZipIfNeeded(zipFile, extractDir)
        }
        val entryFile: File? = if (extractDir.isDirectory) {
            val named = item.htmlEntry?.takeIf { it.isNotBlank() }
                ?.let { File(extractDir, it) }
                ?.takeIf { it.exists() }
            named ?: findHtmlEntry(extractDir)
        } else {
            null
        }
        if (entryFile == null) {
            completion.complete(false)
            return
        }
        showOnly(views.webView)
        views.webView.setBackgroundColor(parseColor(item.backgroundColor, Color.BLACK))
        views.webView.loadUrl(Uri.fromFile(entryFile).toString())
        val durationMs = ((item.durationSec ?: 30.0).coerceAtLeast(5.0) * 1000).toLong()
        pauseAwareDelay(durationMs)
        views.webView.stopLoading()
        completion.complete(true)
    }

    private suspend fun playText(
        version: VersionManifest,
        item: PlaylistItemDto,
        completion: CompletableDeferred<Boolean>
    ) {
        val textData = item.textData
        views.textTitle.text = textData?.title ?: item.contentName ?: ""
        views.textTitle.visibility =
            if (views.textTitle.text.isNullOrBlank()) View.GONE else View.VISIBLE
        views.textBody.text = textData?.body ?: ""
        views.textContainer.setBackgroundColor(
            parseColor(textData?.bgColor, parseColor(item.backgroundColor, Color.BLACK))
        )
        views.textTitle.setTextColor(parseColor(textData?.fgColor, Color.WHITE))
        views.textBody.setTextColor(parseColor(textData?.fgColor, Color.WHITE))

        val imageFile: File? = textData?.imageUrl?.let { url ->
            withContext(Dispatchers.IO) {
                val row = db.downloadDao().findDoneByUrl(version.versionId, url)
                row?.let { File(it.filePath) }?.takeIf { it.exists() }
            }
        }
        if (imageFile != null) {
            views.textImage.visibility = View.VISIBLE
            views.textImage.load(imageFile)
        } else {
            views.textImage.visibility = View.GONE
        }
        showOnly(views.textContainer)
        val durationMs = ((item.durationSec ?: 10.0).coerceAtLeast(2.0) * 1000).toLong()
        pauseAwareDelay(durationMs)
        completion.complete(true)
    }

    // ------------------------------------------------------------------
    // فرمان‌های پخش‌محور (از SyncService)
    // ------------------------------------------------------------------

    /** روی Main thread فراخوانی می‌شود؛ خروجی برای POST /ack/command/ برگردانده می‌شود. */
    fun handleCommand(command: CommandDto): String = try {
        when (command.action) {
            "set_volume" -> {
                val volume = command.params?.get("volume")
                    ?.takeIf { it.isJsonPrimitive }?.asInt ?: 100
                PlaybackStateHolder.masterVolume = volume.coerceIn(0, 100)
                val item = currentItem
                val player = exoPlayer
                if (item != null && player != null) {
                    player.volume = if (item.mute == true) 0f else volumeFor(item)
                }
                "ok"
            }
            "pause_playback" -> {
                PlaybackStateHolder.paused = true
                exoPlayer?.pause()
                "ok"
            }
            "resume_playback" -> {
                PlaybackStateHolder.paused = false
                exoPlayer?.play()
                "ok"
            }
            else -> "ok"
        }
    } catch (e: Exception) {
        "error: ${e.message}"
    }

    // ------------------------------------------------------------------
    // ExoPlayer
    // ------------------------------------------------------------------

    private fun ensurePlayer(): ExoPlayer {
        var player = exoPlayer
        if (player == null) {
            player = ExoPlayer.Builder(appContext).build()
            exoPlayer = player
            views.playerView.player = player
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) {
                        itemCompletion?.complete(true)
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    itemCompletion?.complete(false)
                }
            })
        }
        return player
    }

    private fun stopPlatformPlayers() {
        exoPlayer?.let { player ->
            player.stop()
            player.clearMediaItems()
        }
        views.webView.stopLoading()
        hideAll()
    }

    private fun volumeFor(item: PlaylistItemDto): Float {
        val itemVolume = (item.volume ?: 100).coerceIn(0, 100)
        val master = PlaybackStateHolder.masterVolume.coerceIn(0, 100)
        return (itemVolume / 100f) * (master / 100f)
    }

    private fun resizeModeFor(fitMode: String?): Int = when (fitMode) {
        "cover" -> PlayerView.RESIZE_MODE_ZOOM
        "stretch" -> PlayerView.RESIZE_MODE_FILL
        else -> PlayerView.RESIZE_MODE_FIT
    }

    private fun scaleTypeFor(fitMode: String?): ImageView.ScaleType = when (fitMode) {
        "cover" -> ImageView.ScaleType.CENTER_CROP
        "stretch" -> ImageView.ScaleType.FIT_XY
        else -> ImageView.ScaleType.FIT_CENTER
    }

    private fun parseColor(hex: String?, fallback: Int): Int = try {
        Color.parseColor(hex ?: return fallback)
    } catch (e: Exception) {
        fallback
    }

    // ------------------------------------------------------------------
    // WebView محدودشده (فقط محتوای محلی)
    // ------------------------------------------------------------------

    private fun prepareWebView() {
        views.webView.settings.apply {
            javaScriptEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true           // فقط برای فایل‌های داخلی اپ
            allowContentAccess = false
            setAllowFileAccessFromFileURLs(false)
            setAllowUniversalAccessFromFileURLs(false)
            setGeolocationEnabled(false)
            cacheMode = WebSettings.LOAD_NO_CACHE
            setSupportMultipleWindows(true)
        }
        views.webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = interceptRequest(request.url)

            @Deprecated("برای سازگاری با API < 24")
            @Suppress("DEPRECATION", "OverridingDeprecatedMember")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                interceptRequest(Uri.parse(url))

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = !isAllowedScheme(request.url)

            @Deprecated("برای سازگاری با API < 24")
            @Suppress("DEPRECATION", "OverridingDeprecatedMember")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                !isAllowedScheme(Uri.parse(url))
        }
        views.webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean = true // باز شدن پنجره جدید مسدود است
        }
        views.webView.setDownloadListener { _, _, _, _, _ ->
            // دانلود مسدود است
        }
    }

    private fun isAllowedScheme(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        return scheme == "file" || scheme == "data" || scheme == "blob" || scheme == "about"
    }

    private fun interceptRequest(uri: Uri): WebResourceResponse? {
        return if (isAllowedScheme(uri)) {
            null // پاسخ عادی
        } else {
            WebResourceResponse(
                "text/plain",
                "utf-8",
                403,
                "Forbidden",
                mapOf("Content-Type" to "text/plain"),
                ByteArrayInputStream(ByteArray(0))
            )
        }
    }

    private suspend fun extractZipIfNeeded(zip: File, extractDir: File) = withContext(Dispatchers.IO) {
        val marker = File(extractDir, ".extracted")
        val alreadyExtracted = marker.exists() && extractDir.isDirectory &&
            runCatching { marker.readText().toLong() == zip.length() }.getOrDefault(false)
        if (alreadyExtracted) return@withContext
        try {
            extractDir.deleteRecursively()
            extractDir.mkdirs()
            ZipInputStream(zip.inputStream().buffered()).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    val outFile = File(extractDir, entry.name)
                    val canonical = outFile.canonicalPath
                    if (canonical == extractDir.canonicalPath ||
                        canonical.startsWith(extractDir.canonicalPath + File.separator)
                    ) {
                        if (entry.isDirectory) {
                            outFile.mkdirs()
                        } else {
                            outFile.parentFile?.mkdirs()
                            outFile.outputStream().use { output -> zis.copyTo(output) }
                        }
                    }
                    entry = zis.nextEntry
                }
            }
            marker.writeText(zip.length().toString())
        } catch (e: Exception) {
            // استخراج ناقص — در چرخه بعد دوباره تلاش می‌شود
        }
    }

    private fun findHtmlEntry(dir: File): File? {
        val files = dir.walkTopDown()
            .filter { it.isFile && it.name.endsWith(".html", ignoreCase = true) }
            .toList()
        return files.firstOrNull { it.name.equals("index.html", ignoreCase = true) }
            ?: files.firstOrNull()
    }

    // ------------------------------------------------------------------
    // نمایش و گزارش
    // ------------------------------------------------------------------

    private fun showOnly(vararg shown: View) {
        val shownSet = shown.toSet()
        views.playerView.visibility =
            if (shownSet.contains(views.playerView)) View.VISIBLE else View.GONE
        views.imageView.visibility =
            if (shownSet.contains(views.imageView)) View.VISIBLE else View.GONE
        views.audioView.visibility =
            if (shownSet.contains(views.audioView)) View.VISIBLE else View.GONE
        views.pdfView.visibility =
            if (shownSet.contains(views.pdfView)) View.VISIBLE else View.GONE
        views.webView.visibility =
            if (shownSet.contains(views.webView)) View.VISIBLE else View.GONE
        views.textContainer.visibility =
            if (shownSet.contains(views.textContainer)) View.VISIBLE else View.GONE
        views.idleView.visibility =
            if (shownSet.contains(views.idleView)) View.VISIBLE else View.GONE
        views.bootLoading.visibility = View.GONE
    }

    private fun hideAll() = showOnly()

    private fun showIdle() {
        showOnly(views.idleView)
        views.idleView.text = context.getString(R.string.idle_no_content) +
            "\n" + (AppConfig.deviceName ?: "")
    }

    private suspend fun pauseAwareDelay(durationMs: Long) {
        var remaining = durationMs
        while (remaining > 0) {
            if (!currentCoroutineContext().isActive) return
            if (PlaybackStateHolder.paused) {
                delay(300)
                continue
            }
            val step = minOf(300L, remaining)
            delay(step)
            remaining -= step
        }
    }

    private suspend fun writePlaybackLog(
        version: VersionManifest,
        item: PlaylistItemDto,
        startedAtMs: Long,
        durationSec: Double,
        completed: Boolean,
        error: String?
    ) = withContext(Dispatchers.IO) {
        db.playbackLogDao().insert(
            PlaybackLogEntity(
                versionId = version.versionId,
                deploymentId = version.deploymentId,
                contentId = item.contentId,
                itemOrder = item.order,
                startedAtEpochMs = startedAtMs,
                durationSec = durationSec,
                completed = completed,
                error = error
            )
        )
    }
}
