package ru.zovus.app;

import android.os.Build;
import android.webkit.CookieManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Flushes the Android WebView cookie store so Set-Cookie from fetch()/XHR
 * becomes visible to the next request without killing the app process.
 */
@CapacitorPlugin(name = "WebViewCookies")
public class WebViewCookiesPlugin extends Plugin {

    @PluginMethod
    public void flush(PluginCall call) {
        try {
            CookieManager manager = CookieManager.getInstance();
            manager.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                manager.flush();
            } else {
                //noinspection deprecation
                android.webkit.CookieSyncManager.createInstance(getContext());
                //noinspection deprecation
                android.webkit.CookieSyncManager.getInstance().sync();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "cookie_flush_failed");
        }
    }
}
