package ru.zovus.app

import android.app.Application
import com.vk.id.VKID

class ZovusApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        VKID.init(this)
    }
}
