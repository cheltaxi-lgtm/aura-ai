package ru.zovus.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settingsIntent);
                call.reject("Разрешите установку из неизвестных источников");
                return;
            }
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                File apkFile = new File(getContext().getCacheDir(), "zovus-update.apk");
                if (apkFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    apkFile.delete();
                }

                URL apkUrl = new URL(url);
                connection = (HttpURLConnection) apkUrl.openConnection();
                connection.setConnectTimeout(30_000);
                connection.setReadTimeout(120_000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();

                if (connection.getResponseCode() >= 400) {
                    call.reject("download failed: HTTP " + connection.getResponseCode());
                    return;
                }

                int total = connection.getContentLength();
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apkFile)) {
                    byte[] buffer = new byte[8192];
                    int read;
                    int received = 0;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        received += read;
                        int percent;
                        if (total > 0) {
                            percent = Math.min(99, Math.round((received * 100f) / total));
                        } else {
                            percent = Math.min(95, received / 80_000);
                        }
                        notifyProgress(percent);
                    }
                }

                notifyProgress(100);
                installFromUri(Uri.fromFile(apkFile));
                call.resolve();
            } catch (Exception e) {
                call.reject("download failed: " + e.getMessage(), e);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    private void notifyProgress(int percent) {
        JSObject payload = new JSObject();
        payload.put("percent", percent);
        notifyListeners("downloadProgress", payload);
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("uri is required");
            return;
        }
        try {
            installFromUri(Uri.parse(uriStr));
            call.resolve();
        } catch (Exception e) {
            call.reject("install failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openPlayStore(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            url = "market://details?id=" + getContext().getPackageName();
        }
        try {
            Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(market);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + getContext().getPackageName()));
                web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(web);
                call.resolve();
            } catch (Exception ex) {
                call.reject("openPlayStore failed: " + ex.getMessage(), ex);
            }
        }
    }

    private void installFromUri(Uri uri) {
        Context ctx = getContext();
        File apkFile = resolveApkFile(uri);
        if (apkFile == null || !apkFile.exists()) {
            throw new IllegalStateException("APK file not found");
        }

        String authority = ctx.getPackageName() + ".fileprovider";
        Uri contentUri = FileProvider.getUriForFile(ctx, authority, apkFile);

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        if (getActivity() != null) {
            getActivity().startActivity(intent);
        } else {
            ctx.startActivity(intent);
        }
    }

    private File resolveApkFile(Uri uri) {
        if (uri == null) return null;

        String scheme = uri.getScheme();
        if ("file".equalsIgnoreCase(scheme)) {
            return new File(uri.getPath());
        }

        if ("content".equalsIgnoreCase(scheme)) {
            File cacheCopy = new File(getContext().getCacheDir(), "zovus-update.apk");
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 FileOutputStream out = new FileOutputStream(cacheCopy)) {
                if (in == null) return null;
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                return cacheCopy;
            } catch (Exception e) {
                return null;
            }
        }

        if (uri.getPath() != null) {
            File direct = new File(uri.getPath());
            if (direct.exists()) return direct;
        }

        return null;
    }
}
