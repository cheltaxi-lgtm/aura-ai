"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { markAppShellOnDocument, shouldUseAppShellClient, isAppShellSplashDone } from "@/lib/app-shell";
import { checkAndroidAppUpdate, dismissOptionalUpdate } from "@/lib/app-shell-update-check";
import { useAppShellConnectivity } from "@/hooks/useAppConnectivity";
import AppShellSplash, { APP_SHELL_SPLASH_HIDDEN_EVENT } from "@/components/AppShellSplash";
import AppShellBottomNav from "@/components/AppShellBottomNav";
import AppShellOfflineGate from "@/components/AppShellOfflineGate";
import AppUpdatePrompt, { type AppUpdatePromptState } from "@/components/AppUpdatePrompt";

function resolveAppShellUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol === "zovus:" && url.host === "open") {
      const path = url.pathname && url.pathname !== "/" ? url.pathname : "/";
      const target = new URL(`https://zovus.ru${path}`);
      target.search = url.search;
      target.searchParams.set("app", "1");
      return target.toString();
    }
    if (url.hostname === "zovus.ru" || url.hostname.endsWith(".zovus.ru")) {
      if (!url.searchParams.has("app")) url.searchParams.set("app", "1");
      return url.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

export default function AppShellBridge() {
  const [updateAvailable, setUpdateAvailable] = useState<AppUpdatePromptState | null>(null);
  const [splashDone, setSplashDone] = useState(() => {
    if (!shouldUseAppShellClient()) return true;
    return isAppShellSplashDone();
  });
  const { blocked, checking, retry } = useAppShellConnectivity();
  const inShell = shouldUseAppShellClient();
  const showGate = splashDone && Boolean(blocked) && !updateAvailable?.forced;
  const showTabs = inShell && splashDone && !showGate && !updateAvailable?.forced;

  const refreshUpdate = useCallback(async () => {
    const next = await checkAndroidAppUpdate();
    setUpdateAvailable(next);
  }, []);

  useEffect(() => {
    if (shouldUseAppShellClient()) markAppShellOnDocument();

    let backListener: { remove: () => void } | undefined;
    let urlListener: { remove: () => void } | undefined;
    let resumeListener: { remove: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const isNative =
        typeof window !== "undefined" &&
        Boolean(
          (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
        );

      if (!shouldUseAppShellClient() && !isNative) return;
      markAppShellOnDocument();

      if (isNative) {
        const [{ Capacitor }, app, statusBar, haptics] = await Promise.all([
          import("@capacitor/core"),
          import("@capacitor/app"),
          import("@capacitor/status-bar"),
          import("@capacitor/haptics"),
        ]);
        if (cancelled) return;

        if (Capacitor.getPlatform() === "android") {
          try {
            await statusBar.StatusBar.setOverlaysWebView({ overlay: true });
            await statusBar.StatusBar.setBackgroundColor({ color: "#0b0714" });
            await statusBar.StatusBar.setStyle({ style: statusBar.Style.Dark });
          } catch {
            /* optional */
          }
        }

        await refreshUpdate();

        resumeListener = await app.App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refreshUpdate();
        });

        backListener = await app.App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }
          void (async () => {
            try {
              await haptics.Haptics.impact({ style: haptics.ImpactStyle.Light });
            } catch {
              /* ignore */
            }
            const exit = window.confirm("Выйти из Zovus?");
            if (exit) await app.App.exitApp();
          })();
        });

        urlListener = await app.App.addListener("appUrlOpen", (event) => {
          if (event.url) window.location.assign(resolveAppShellUrl(event.url));
        });

        try {
          const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
          const avail = await NativeBiometric.isAvailable();
          if (avail.isAvailable) {
            const key = "zovus_bio_gate_v1";
            if (sessionStorage.getItem(key) !== "1") {
              const verified = await NativeBiometric.verifyIdentity({
                reason: "Разблокировать Zovus",
                title: "Zovus",
                subtitle: "Подтвердите личность",
                description: "Биометрия или PIN устройства",
              })
                .then(() => true)
                .catch(() => false);
              if (verified) sessionStorage.setItem(key, "1");
            }
          }
        } catch {
          /* optional */
        }
      }
    })();

    return () => {
      cancelled = true;
      backListener?.remove();
      urlListener?.remove();
      resumeListener?.remove();
    };
  }, [refreshUpdate]);

  useEffect(() => {
    if (!shouldUseAppShellClient()) {
      setSplashDone(true);
      return;
    }
    const onSplashHidden = () => setSplashDone(true);
    window.addEventListener(APP_SHELL_SPLASH_HIDDEN_EVENT, onSplashHidden);
    return () => window.removeEventListener(APP_SHELL_SPLASH_HIDDEN_EVENT, onSplashHidden);
  }, []);

  const pullRef = useRef({ startY: 0, pulling: false });
  useEffect(() => {
    if (!inShell) return;
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 8) return;
      pullRef.current.startY = e.touches[0]?.clientY ?? 0;
      pullRef.current.pulling = true;
    };
    const onTouchEnd = () => {
      pullRef.current.pulling = false;
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [inShell]);

  return (
    <>
      <AppShellSplash />
      {updateAvailable ? (
        <AppUpdatePrompt
          update={updateAvailable}
          onDismiss={
            updateAvailable.forced
              ? undefined
              : () => {
                  dismissOptionalUpdate(updateAvailable.versionCode);
                  setUpdateAvailable(null);
                }
          }
        />
      ) : null}
      {showGate && blocked ? (
        <AppShellOfflineGate reason={blocked} checking={checking} onRetry={retry} />
      ) : null}
      {showTabs ? <AppShellBottomNav /> : null}
    </>
  );
}
