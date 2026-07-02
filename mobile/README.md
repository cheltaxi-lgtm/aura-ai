# Zovus Android (Capacitor)

Native shell for the production Zovus web app. The WebView loads `https://zovus.ru/?app=1` — UI and API stay on the existing Next.js deployment.

## Prerequisites

- Node.js 22+ (Capacitor CLI 8 requirement)
- Android Studio (SDK 34+, build-tools)
- JDK 17

## First-time setup

```bash
cd mobile
npm install
npx cap add android   # only if android/ is missing
npx cap sync android
npx cap open android
```

## Local dev against staging

```bash
set CAPACITOR_SERVER_URL=https://your-preview.vercel.app
npx cap sync android
```

## Release build (manual signing)

1. Create a release keystore (store outside git):

   ```bash
   keytool -genkey -v -keystore zovus-release.keystore -alias zovus -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add signing config in `android/` via Android Studio **Build → Generate Signed Bundle / APK**, or Gradle `signingConfigs` using env vars:

   - `ZOvus_KEYSTORE_PATH`
   - `ZOvus_KEYSTORE_PASSWORD`
   - `ZOvus_KEY_ALIAS`
   - `ZOvus_KEY_PASSWORD`

3. Build:

   ```bash
   npm run build:android:release
   ```

4. Outputs:

   - APK: `android/app/build/outputs/apk/release/`
   - AAB: `android/app/build/outputs/bundle/release/` (RuStore / Play)

5. Upload APK to `public/releases/zovus-latest.apk` on deploy (or CDN) and bump env on Vercel:

   - `ANDROID_VERSION_CODE`
   - `ANDROID_VERSION_NAME`
   - `ANDROID_APK_URL` / `NEXT_PUBLIC_ANDROID_APK_URL`
   - `ANDROID_MIN_VERSION_CODE`

## App Links (verified deep links)

Asset links are served dynamically from `/.well-known/assetlinks.json` (see `src/app/.well-known/assetlinks.json/route.ts`).

1. Print SHA-256 from your keystore:

   ```bash
   npm run mobile:cert-sha
   # release:
   node scripts/print-android-cert-sha.mjs --keystore path/to/zovus-release.keystore --alias zovus
   ```

2. Set `ANDROID_ASSETLINKS_SHA256` on Vercel (colonless fingerprint; comma-separated for debug+release).

3. Deploy the web app so `https://zovus.ru/.well-known/assetlinks.json` returns the fingerprint.

## CI note

Production deploy (`.github/workflows/deploy.yml`) targets Vercel web only. Release APK/AAB signing stays manual until keystore secrets are configured.

Debug APK: `.github/workflows/android-debug.yml` (unsigned, on push to `mobile/`).

Regenerate branded launcher PNGs:

```bash
npm run mobile:icons
```

## Premium features in this shell

| Feature | Layer |
|---------|--------|
| Status bar / edge-to-edge | Capacitor StatusBar + `AppShellBridge` |
| Splash fade | SplashScreen plugin + `#0b0714` |
| Back gesture / button | `@capacitor/app` backButton listener |
| Biometric app unlock | `@capgo/capacitor-native-biometric` (session gate, not auth replacement) |
| Branded pull-to-refresh | `AppShellBridge` touch handler + `app-shell.css` |
| In-app cinematic splash | `AppShellSplash` (web overlay, ~900ms) |
| App update gate | `/api/app/android-version` + `minVersionCode` |
| Material You monochrome icon | `ic_launcher_monochrome.xml` |
| Edge-to-edge | `MainActivity` + StatusBar overlay |
