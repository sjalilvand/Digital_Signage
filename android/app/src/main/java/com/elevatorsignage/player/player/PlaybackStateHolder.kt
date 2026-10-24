package com.elevatorsignage.player.player

import com.elevatorsignage.player.data.remote.ManifestResponse

/**
 * حالت مشترک بین PlayerController (UI) و SyncService.
 * SyncService آخرین manifest و وضعیت «در حال پخش» را از همین‌جا می‌خواند و
 * فرمان‌های set_volume / pause / resume را به controller می‌رساند.
 */
object PlaybackStateHolder {

    @Volatile
    var controller: PlayerController? = null

    @Volatile
    var manifest: ManifestResponse? = null

    @Volatile
    var playingVersionId: String? = null

    @Volatile
    var playingDeploymentId: String? = null

    @Volatile
    var playingItemOrder: Int = 0

    @Volatile
    var playingContentId: String? = null

    @Volatile
    var playingStartedAtMs: Long = 0

    @Volatile
    var paused: Boolean = false

    @Volatile
    var masterVolume: Int = 100

    fun clearPlaying() {
        playingVersionId = null
        playingDeploymentId = null
        playingItemOrder = 0
        playingContentId = null
        playingStartedAtMs = 0
    }
}
