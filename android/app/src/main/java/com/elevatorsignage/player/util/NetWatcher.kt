package com.elevatorsignage.player.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * پایش دسترسی شبکه.
 * نکته: فقط NET_CAPABILITY_INTERNET بررسی می‌شود (نه VALIDATED) — چون باکس آسانسور
 * ممکن است فقط به LAN سرور دسترسی داشته باشد و VALIDATED در آن برقرار نیست.
 */
object NetWatcher {

    @Volatile
    var isOnlineNow: Boolean = true
        private set

    fun isOnline(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        return try {
            val networks: Array<Network> = if (Build.VERSION.SDK_INT >= 23) {
                arrayOfNotNull(cm.activeNetwork)
            } else {
                cm.allNetworks ?: emptyArray()
            }
            networks.any { network ->
                cm.getNetworkCapabilities(network)
                    ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
            }
        } catch (e: Exception) {
            // در صورت شکست تشخیص، خوش‌بینانه «آنلاین» فرض می‌شود؛ پخش هرگز متوقف نمی‌شود
            true
        }
    }

    fun observe(context: Context): Flow<Boolean> = callbackFlow {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (cm == null) {
            trySend(false)
            awaitClose { }
        } else {
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    isOnlineNow = true
                    trySend(true)
                }

                override fun onLost(network: Network) {
                    val online = isOnline(context)
                    isOnlineNow = online
                    trySend(online)
                }

                override fun onCapabilitiesChanged(
                    network: Network,
                    networkCapabilities: NetworkCapabilities
                ) {
                    val online = networkCapabilities
                        .hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    isOnlineNow = online
                    trySend(online)
                }
            }
            trySend(isOnline(context))
            try {
                val request = NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                cm.registerNetworkCallback(request, callback)
            } catch (e: Exception) {
                trySend(isOnline(context))
            }
            awaitClose {
                try {
                    cm.unregisterNetworkCallback(callback)
                } catch (e: Exception) {
                    // نادیده گرفتن — receiver قبلاً unregister شده
                }
            }
        }
    }.distinctUntilChanged()
}
