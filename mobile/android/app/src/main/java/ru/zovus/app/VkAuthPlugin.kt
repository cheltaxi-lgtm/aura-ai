package ru.zovus.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.vk.id.AccessToken
import com.vk.id.VKID
import com.vk.id.VKIDAuthFail
import com.vk.id.auth.VKIDAuthCallback
import com.vk.id.auth.VKIDAuthParams

@CapacitorPlugin(name = "VkAuth")
class VkAuthPlugin : Plugin() {
    @PluginMethod
    fun signIn(call: PluginCall) {
        activity.runOnUiThread {
            val params = VKIDAuthParams {
                scopes = setOf("email")
            }
            VKID.instance.authorize(
                activity,
                object : VKIDAuthCallback {
                    override fun onAuth(accessToken: AccessToken) {
                        val result = JSObject()
                        result.put("accessToken", accessToken.token)
                        call.resolve(result)
                    }

                    override fun onFail(fail: VKIDAuthFail) {
                        call.reject(fail.description)
                    }
                },
                params
            )
        }
    }
}
