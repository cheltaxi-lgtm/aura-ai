package ru.zovus.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import android.content.pm.PackageManager;
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
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        if (!isAllowedApkUrl(url)) {
            call.reject("APK URL not allowed");
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
                assertApkPackage(apkFile);
                assertApkSignatureCompatible(apkFile);
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

    @PluginMethod
    public void openAppDetails(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("openAppDetails failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("openExternalUrl failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getInstalledCertSha256(PluginCall call) {
        try {
            String sha256 = readInstalledCertSha256();
            if (sha256 == null || sha256.isEmpty()) {
                call.reject("signing certificate unavailable");
                return;
            }
            JSObject payload = new JSObject();
            payload.put("sha256", sha256);
            call.resolve(payload);
        } catch (Exception e) {
            call.reject("getInstalledCertSha256 failed: " + e.getMessage(), e);
        }
    }

    private void installFromUri(Uri uri) {
        Context ctx = getContext();
        File apkFile = resolveApkFile(uri);
        if (apkFile == null || !apkFile.exists()) {
            throw new IllegalStateException("APK file not found");
        }
        assertApkPackage(apkFile);
        assertApkSignatureCompatible(apkFile);

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

    private void assertApkPackage(File apkFile) {
        PackageManager pm = getContext().getPackageManager();
        PackageInfo info = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
        if (info == null) {
            throw new IllegalStateException("Invalid APK file");
        }
        if (!getContext().getPackageName().equals(info.packageName)) {
            throw new IllegalStateException("APK package mismatch");
        }
    }

    private void assertApkSignatureCompatible(File apkFile) {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;

        PackageInfo installed;
        try {
            installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        } catch (PackageManager.NameNotFoundException e) {
            return;
        }

        PackageInfo archive = readArchivePackageInfo(apkFile, flags);
        if (archive == null) {
            return;
        }

        Signature[] installedSigs = readPackageSignatures(installed);
        Signature[] archiveSigs = readPackageSignatures(archive);
        if (!signaturesMatch(installedSigs, archiveSigs)) {
            throw new IllegalStateException("SIGNATURE_MISMATCH");
        }
    }

    private PackageInfo readArchivePackageInfo(File apkFile, int flags) {
        PackageManager pm = getContext().getPackageManager();
        PackageInfo archive = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (archive == null) {
            return null;
        }
        archive.applicationInfo.sourceDir = apkFile.getAbsolutePath();
        archive.applicationInfo.publicSourceDir = apkFile.getAbsolutePath();
        return archive;
    }

    private Signature[] readPackageSignatures(PackageInfo info) {
        if (info == null) {
            return null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) {
                return null;
            }
            return info.signingInfo.getApkContentsSigners();
        }
        @SuppressWarnings("deprecation")
        Signature[] legacy = info.signatures;
        return legacy;
    }

    private boolean signaturesMatch(Signature[] installed, Signature[] archive) {
        if (installed == null || archive == null || installed.length == 0 || archive.length == 0) {
            return true;
        }
        return installed[0].equals(archive[0]);
    }

    private String readInstalledCertSha256() throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        Signature[] signatures = readPackageSignatures(installed);
        if (signatures == null || signatures.length == 0) {
            return null;
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(signatures[0].toByteArray());
        return bytesToHex(hash);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02X", value));
        }
        return builder.toString();
    }

    private boolean isAllowedApkUrl(String raw) {
        try {
            URL parsed = new URL(raw);
            if (!"https".equalsIgnoreCase(parsed.getProtocol())) return false;
            String host = parsed.getHost();
            if (host == null) return false;
            host = host.toLowerCase();
            if (!host.equals("zovus.ru") && !host.equals("www.zovus.ru") && !host.endsWith(".zovus.ru")) {
                return false;
            }
            String path = parsed.getPath();
            return path != null && path.startsWith("/releases/") && path.endsWith(".apk");
        } catch (Exception e) {
            return false;
        }
    }
}
