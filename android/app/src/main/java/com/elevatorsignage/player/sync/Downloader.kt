package com.elevatorsignage.player.sync

import android.content.Context
import com.elevatorsignage.player.config.AppConfig
import com.elevatorsignage.player.data.local.DatabaseProvider
import com.elevatorsignage.player.data.local.DownloadEntity
import com.elevatorsignage.player.data.remote.FileRef
import com.elevatorsignage.player.data.remote.ManifestResponse
import com.elevatorsignage.player.player.PlaybackStateHolder
import com.elevatorsignage.player.util.ContentPaths
import com.elevatorsignage.player.util.Hashing
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * دانلود فایل‌های نسخه‌ها با resume (قرارداد §4.5):
 *  - «Range: bytes=N-» → 206 ادامه / 200 شروع مجدد / 416 بررسی تکمیل
 *  - هش SHA-256 استریم‌شده (شامل بخش قبلی .part) و مقایسه سایز
 *  - نوشتن در «<role>[_<page>].part» و rename پس از تأیید
 *  - نسخه ناقص هرگز فعال نمی‌شود (Safe Replacement)
 */
class Downloader(private val context: Context, private val scope: CoroutineScope) {

    data class DeploymentState(val status: String, val progress: Int?, val error: String?)

    private val db = DatabaseProvider.get()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private var workerJob: Job? = null

    companion object {
        private const val PROGRESS_UPDATE_BYTES = 512L * 1024L
    }

    fun startWorker() {
        if (workerJob?.isActive == true) return
        workerJob = scope.launch(Dispatchers.IO) { workerLoop() }
    }

    private suspend fun workerLoop() {
        while (currentCoroutineContext().isActive) {
            val row = db.downloadDao().nextPending(DownloadEntity.MAX_ATTEMPTS)
            if (row == null) {
                delay(2000)
                continue
            }
            val ok = try {
                downloadOne(row)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                false
            }
            if (!ok) delay(5000) // جلوگیری از حلقه داغ روی فایل خراب
        }
    }

    /**
     * همگام‌سازی صف دانلود با آخرین manifest:
     * حذف ردیف/فایل نسخه‌های حذف‌شده (به‌جز نسخه در حال پخش)، درج فایل‌های جدید،
     * ریست ردیف‌های done که فایل‌شان از بین رفته و بازسازی ردیف‌هایی که url/sha/size تغییر کرده.
     */
    suspend fun reconcile(manifest: ManifestResponse) = withContext(Dispatchers.IO) {
        val manifestVersionIds = manifest.versions.orEmpty().map { it.versionId }.toSet()
        val playingVersion = PlaybackStateHolder.playingVersionId

        for (row in db.downloadDao().all()) {
            if (row.versionId !in manifestVersionIds && row.versionId != playingVersion) {
                File(row.filePath).delete()
                File(row.filePath + ".part").delete()
                db.downloadDao().delete(row)
            }
        }

        for (version in manifest.versions.orEmpty()) {
            for (item in version.items.orEmpty()) {
                for (fileRef in item.files.orEmpty()) {
                    val target = ContentPaths.filePath(
                        context.filesDir, version.versionId, item.contentId, fileRef.role, fileRef.page
                    )
                    val existing = db.downloadDao()
                        .find(version.versionId, item.contentId, fileRef.role, fileRef.page)
                    val expectedSha = fileRef.sha256 ?: ""
                    val changed = existing == null ||
                        existing.url != fileRef.url ||
                        existing.expectedSha256 != expectedSha ||
                        existing.expectedSize != fileRef.size
                    when {
                        changed && existing != null -> {
                            File(existing.filePath).delete()
                            File(existing.filePath + ".part").delete()
                            File(existing.filePath).parentFile?.let { parent ->
                                File(parent, "html_extracted").deleteRecursively()
                            }
                            db.downloadDao().delete(existing)
                            insertNewRow(
                                version.versionId, item.contentId,
                                fileRef.role, fileRef.page, fileRef.url,
                                target, expectedSha, fileRef.size
                            )
                        }
                        changed -> insertNewRow(
                            version.versionId, item.contentId,
                            fileRef.role, fileRef.page, fileRef.url,
                            target, expectedSha, fileRef.size
                        )
                        existing != null && existing.status == DownloadEntity.STATUS_DONE -> {
                            val file = File(existing.filePath)
                            if (!file.exists() || file.length() != existing.expectedSize) {
                                db.downloadDao().update(
                                    existing.copy(
                                        status = DownloadEntity.STATUS_DOWNLOADING,
                                        downloadedBytes = 0,
                                        attempts = 0,
                                        updatedAt = System.currentTimeMillis()
                                    )
                                )
                            }
                        }
                        else -> {
                            // در حال دانلود یا شکست قبلی — وضعیت حفظ می‌شود
                        }
                    }
                }
            }
        }
    }

    private suspend fun insertNewRow(
        versionId: String,
        contentId: String,
        role: String,
        page: Int?,
        url: String,
        target: File,
        expectedSha: String,
        expectedSize: Long
    ) {
        target.parentFile?.mkdirs()
        db.downloadDao().insert(
            DownloadEntity(
                versionId = versionId,
                contentId = contentId,
                role = role,
                page = page,
                url = url,
                filePath = target.absolutePath,
                expectedSha256 = expectedSha,
                expectedSize = expectedSize,
                downloadedBytes = 0,
                status = DownloadEntity.STATUS_DOWNLOADING,
                attempts = 0,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    private suspend fun downloadOne(row: DownloadEntity): Boolean {
        val target = File(row.filePath)
        val part = File(row.filePath + ".part")
        target.parentFile?.mkdirs()

        var bytes = 0L
        val digest = MessageDigest.getInstance("SHA-256")

        return try {
            // resume: هش بخش موجود فایل .part
            if (part.exists()) {
                bytes = part.length()
                if (row.expectedSize > 0 && bytes > row.expectedSize) {
                    part.delete()
                    bytes = 0
                } else if (bytes > 0) {
                    Hashing.updateDigestFromFile(part, digest)
                }
            }
            if (row.expectedSize > 0 && bytes == row.expectedSize) {
                return finishDownload(row, part, target, digest)
            }

            val url = AppConfig.serverBaseUrl.trimEnd('/') + row.url
            val requestBuilder = Request.Builder().url(url)
            if (bytes > 0) requestBuilder.header("Range", "bytes=$bytes-")

            client.newCall(requestBuilder.build()).execute().use { response ->
                when {
                    response.code == 206 -> {
                        // ادامه از سر فایل
                    }
                    response.code == 200 -> {
                        // سرور Range را رد کرده — شروع مجدد
                        part.delete()
                        bytes = 0
                        digest.reset()
                    }
                    response.code == 416 -> {
                        if (row.expectedSize > 0 && bytes == row.expectedSize) {
                            return finishDownload(row, part, target, digest)
                        }
                        part.delete()
                        markFailure(row, "HTTP 416")
                        return false
                    }
                    response.isSuccessful -> {
                        part.delete()
                        bytes = 0
                        digest.reset()
                    }
                    else -> throw IOException("HTTP ${response.code}")
                }

                val body = response.body ?: throw IOException("پاسخ خالی از سرور")
                val append = response.code == 206 && bytes > 0
                FileOutputStream(part, append).use { output ->
                    var lastProgressUpdate = 0L
                    body.byteStream().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            digest.update(buffer, 0, read)
                            bytes += read
                            if (bytes - lastProgressUpdate >= PROGRESS_UPDATE_BYTES) {
                                lastProgressUpdate = bytes
                                db.downloadDao().update(row.copy(downloadedBytes = bytes))
                            }
                        }
                    }
                }
                finishDownload(row, part, target, digest)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            markFailure(row, e.message ?: "خطای دانلود")
            false
        }
    }

    /** تأیید هش/سایز، rename و علامت‌گذاری done — false یعنی باید دوباره تلاش شود */
    private suspend fun finishDownload(
        row: DownloadEntity,
        part: File,
        target: File,
        digest: MessageDigest
    ): Boolean {
        val size = if (part.exists()) part.length() else -1L
        val hex = Hashing.toHex(digest)
        val sizeOk = row.expectedSize <= 0 || size == row.expectedSize
        val hashOk = row.expectedSha256.isBlank() || hex.equals(row.expectedSha256, ignoreCase = true)
        if (size < 0 || !sizeOk || !hashOk) {
            part.delete()
            markFailure(row, if (!hashOk) "SHA-256 mismatch" else "مغایرت حجم فایل")
            return false
        }
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) {
            part.delete()
            markFailure(row, "rename failed")
            return false
        }
        db.downloadDao().update(
            row.copy(
                status = DownloadEntity.STATUS_DONE,
                downloadedBytes = size,
                updatedAt = System.currentTimeMillis()
            )
        )
        return true
    }

    private suspend fun markFailure(row: DownloadEntity, message: String) {
        val attempts = row.attempts + 1
        db.downloadDao().update(
            row.copy(
                status = if (attempts >= DownloadEntity.MAX_ATTEMPTS) {
                    DownloadEntity.STATUS_FAILED
                } else {
                    DownloadEntity.STATUS_DOWNLOADING
                },
                attempts = attempts,
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    /** وضعیت deployment برای گزارش §4.2 */
    suspend fun deploymentState(versionId: String, totalFiles: Int): DeploymentState =
        withContext(Dispatchers.IO) {
            val rows = db.downloadDao().forVersion(versionId)
            if (rows.isEmpty()) {
                return@withContext if (totalFiles == 0) {
                    DeploymentState("ready", 100, null)
                } else {
                    DeploymentState("downloading", 0, null)
                }
            }
            val doneRows = rows.filter { it.status == DownloadEntity.STATUS_DONE }
            val failedRows = rows.filter { it.status == DownloadEntity.STATUS_FAILED }
            val totalBytes = rows.sumOf { it.expectedSize }
            val haveBytes = doneRows.sumOf { it.expectedSize } +
                rows.filter { it.status != DownloadEntity.STATUS_DONE }.sumOf { it.downloadedBytes }
            val progress = if (totalBytes <= 0) {
                0
            } else {
                ((haveBytes * 100) / totalBytes).toInt().coerceIn(0, 100)
            }
            when {
                failedRows.isNotEmpty() -> DeploymentState(
                    "failed", progress, "خطا در دریافت فایل‌ها — تلاش مجدد خودکار"
                )
                totalFiles > 0 && doneRows.size >= totalFiles -> DeploymentState("ready", 100, null)
                else -> DeploymentState("downloading", progress, null)
            }
        }

    /** حذف دانلودهای نسخه‌هایی که سرور آن‌ها را لغو کرده است */
    suspend fun cancelPending(manifest: ManifestResponse) = withContext(Dispatchers.IO) {
        for (version in manifest.versions.orEmpty()) {
            if (version.serverHintStatus == "cancelled") {
                deleteVersionData(version.versionId)
            }
        }
    }

    /** فرمان cleanup_files: حذف همه فایل‌های خارج از نسخه‌های فعلی manifest و نسخه در حال پخش */
    suspend fun cleanup(keepVersionIds: Set<String>): Int = withContext(Dispatchers.IO) {
        var freedFiles = 0
        for (row in db.downloadDao().all()) {
            if (row.versionId !in keepVersionIds) {
                if (File(row.filePath).delete()) freedFiles++
                File(row.filePath + ".part").delete()
                db.downloadDao().delete(row)
            }
        }
        val root = ContentPaths.contentRoot(context.filesDir)
        root.listFiles()?.forEach { versionDir ->
            if (versionDir.isDirectory && versionDir.name !in keepVersionIds) {
                versionDir.deleteRecursively()
            }
        }
        freedFiles
    }

    private suspend fun deleteVersionData(versionId: String) {
        for (row in db.downloadDao().forVersion(versionId)) {
            File(row.filePath).delete()
            File(row.filePath + ".part").delete()
            db.downloadDao().delete(row)
        }
        ContentPaths.versionDir(context.filesDir, versionId).deleteRecursively()
    }
}
