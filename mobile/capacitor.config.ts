import type { CapacitorConfig } from "@capacitor/cli";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  process.env.CAPACITOR_SERVER_URL?.replace(/\/$/, "") ||
  "https://zovus.ru";

const config: CapacitorConfig = {
  appId: "ru.zovus.app",
  appName: "Zovus",
  webDir: "www",
  server: {
    url: `${appUrl}/?app=1`,
    cleartext: false,
    androidScheme: "https",
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#0b0714",
    allowMixedContent: false,
    // captureInput must stay OFF: with it on, the WebView intercepts IME input
    // via BaseInputConnection and Cyrillic/composition keyboards (GBoard, Samsung)
    // show up but typed characters never reach the page.
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 6000,
      backgroundColor: "#0b0714",
      androidSplashResourceName: "splash",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      backgroundColor: "#0b0714",
      style: "DARK",
      overlaysWebView: true,
    },
  },
};

export default config;
