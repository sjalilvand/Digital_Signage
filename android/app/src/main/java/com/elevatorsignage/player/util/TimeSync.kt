package com.elevatorsignage.player.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.regex.Pattern

/**
 * همگام‌سازی زمان با سرور: آفست از «server_time» هر manifest محاسبه و ذخیره می‌شود؛
 * بازه‌های schedule با now() (ساعت سرور) ارزیابی می‌شوند — قرارداد §4.1.
 * (java.time در minSdk 21 موجود نیست؛ پارسر دستی ISO-8601 استفاده شده است.)
 */
object TimeSync {

    @Volatile
    var offsetMs: Long = 0

    fun updateFromServer(serverTimeIso: String?) {
        val serverNow = parseIso(serverTimeIso) ?: return
        offsetMs = serverNow - System.currentTimeMillis()
    }

    /** «اکنون» بر اساس ساعت سرور */
    fun now(): Long = System.currentTimeMillis() + offsetMs

    /** خروجی ISO-8601 با آفست منطقه زمانی دستگاه — برای started_at گزارش‌ها */
    fun toIso(epochMs: Long): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US)
        return format.format(Date(epochMs))
    }

    /** پارسر ISO-8601 سازگار با API 21: «2026-01-01T10:00:00+03:30» / «+0330» / «Z» */
    fun parseIso(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        val matcher = ISO_PATTERN.matcher(iso.trim())
        if (!matcher.matches()) return null
        return try {
            val year = matcher.group(1)!!.toInt()
            val month = matcher.group(2)!!.toInt()
            val day = matcher.group(3)!!.toInt()
            val hour = matcher.group(4)!!.toInt()
            val minute = matcher.group(5)!!.toInt()
            val second = matcher.group(6)!!.toInt()
            val fraction = matcher.group(7)
            val millis = when {
                fraction == null -> 0
                fraction.length <= 3 -> fraction.padEnd(3, '0').toInt()
                else -> fraction.substring(0, 3).toInt()
            }
            val tzPart = matcher.group(8)
            val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
            calendar.clear()
            calendar.set(year, month - 1, day, hour, minute, second)
            calendar.set(Calendar.MILLISECOND, millis)
            var epoch = calendar.timeInMillis
            if (tzPart != null && tzPart != "Z" && tzPart != "z") {
                val tzHours = matcher.group(9)?.toIntOrNull() ?: 0
                val tzMinutes = matcher.group(10)?.toIntOrNull() ?: 0
                val offset = (tzHours * 3600L + tzMinutes * 60L) * 1000L
                epoch = if (tzPart.startsWith("-")) epoch + offset else epoch - offset
            }
            epoch
        } catch (e: Exception) {
            null
        }
    }

    private val ISO_PATTERN: Pattern = Pattern.compile(
        "^(\\d{4})-(\\d{2})-(\\d{2})[Tt ](\\d{2}):(\\d{2}):(\\d{2})" +
            "(?:\\.(\\d{1,6}))?(Z|z|[+-](\\d{2}):?(\\d{2})?)?$"
    )
}
