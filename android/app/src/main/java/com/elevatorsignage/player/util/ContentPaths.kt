package com.elevatorsignage.player.util

import java.io.File

/**
 * طرح‌بندی مسیر فایل‌های محلی (مشترک بین Downloader و PlayerController):
 *   <filesDir>/content/<versionId>/<contentId>/<role>[_<page>]
 */
object ContentPaths {

    fun contentRoot(filesDir: File): File = File(filesDir, "content")

    fun versionDir(filesDir: File, versionId: String): File =
        File(contentRoot(filesDir), versionId)

    fun contentDir(filesDir: File, versionId: String, contentId: String): File =
        File(versionDir(filesDir, versionId), contentId)

    fun fileNameFor(role: String, page: Int?): String = role + (page?.let { "_$it" } ?: "")

    fun filePath(
        filesDir: File,
        versionId: String,
        contentId: String,
        role: String,
        page: Int?
    ): File = File(contentDir(filesDir, versionId, contentId), fileNameFor(role, page))
}
