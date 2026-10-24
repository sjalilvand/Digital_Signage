package com.elevatorsignage.player.util

/** کمکی کوچک برای نمایش ارقام فارسی */
object Persian {

    private val mapping = mapOf(
        '0' to '۰', '1' to '۱', '2' to '۲', '3' to '۳', '4' to '۴',
        '5' to '۵', '6' to '۶', '7' to '۷', '8' to '۸', '9' to '۹'
    )

    /** ارقام لاتین رشته را به فارسی تبدیل می‌کند */
    fun digits(input: String): String = buildString(input.length) {
        input.forEach { ch -> append(mapping[ch] ?: ch) }
    }
}
