package com.elevatorsignage.player.util

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/** هش استریمینگ SHA-256 برای اعتبارسنجی فایل‌های دانلودشده (قرارداد §4.5) */
object Hashing {

    /** به‌روزرسانی digest با محتوای موجود فایل — برای ادامه هش پس از resume */
    fun updateDigestFromFile(file: File, digest: MessageDigest) {
        if (!file.exists()) return
        FileInputStream(file).use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
    }

    fun toHex(digest: MessageDigest): String =
        digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }

    fun sha256Hex(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        updateDigestFromFile(file, digest)
        return toHex(digest)
    }

    fun sha256HexOfBytes(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString(separator = "") { byte -> "%02x".format(byte) }
}
