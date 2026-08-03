"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearStaleDesktopAppShell,
  markAppShellOnDocument,
  shouldUseAppShellClient,
  isAppShellSplashDone,
} from "@/lib/app-shell";
import { registerAppShellRouter } from "@/lib/app-shell-router-bus";
import { resolveAppShellDeepLink } from "@/lib/allowed-hosts";
import { checkAndroidAppUpdate, dismissOptionalUpdate } from "@/lib/app-shell-update-check";
import { useAppShellConnectivity } from "@/hooks/useAppConnectivity";
import AppShellSplash, { APP_SHELL_SPLASH_HIDDEN_EVENT } from "@/components/AppShellSplash";
import AppShellBottomNav from "@/components/AppShellBottomNav";
import AppShellOfflineGate from "@/components/AppShellOfflineGate";
import AppExitConfirm from "@/components/AppExitConfirm";
import AppUpdatePrompt, { type AppUpdatePromptState } from "@/components/AppUpdatePrompt";
import { APP_UPDATE_RECHECK_EVENT } from "@/hooks/useAppShellVersion";

const UPDATE_POLL_MS = 30 * 60 * 1000;

export default function AppShellBridge() {
  const router = useRouter();
  const [updateAvailable, setUpdateAvailable] = useState<AppUpdatePromptState | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const exitAppRef = useRef<(() => Promise<void>) | null>(null);
  const [splashDone, setSplashDone] = useState(() => {
    if (!shouldUseAppShellClient()) return true;
    return isAppShellSplashDone();
  });
  const { blocked, checking, retry } = useAppShellConnectivity({ enabled: splashDone });
  const inShell = shouldUseAppShellClient();
  const showGate = splashDone && Boolean(blocked) && !updateAvailable?.forced;
  const showTabs = inShell && splashDone && !showGate && !updateAvailable?.forced;

  const refreshUpdate = useCallback(async (ignoreDismissed = false) => {
    const next = await checkAndroidAppUpdate({ ignoreDismissed });
    // A background re-check must never close a prompt the user is looking at.
    setUpdateAvailable((prev) => next ?? (ignoreDismissed ? null : prev));
  }, []);

  useEffect(() => {
    const onManualCheck = () => void refreshUpdate(true);
    window.addEventListener(APP_UPDATE_RECHECK_EVENT, onManualCheck);
    const timer = setInterval(() => void refreshUpdate(), UPDATE_POLL_MS);
    return () => {
      window.removeEventListener(APP_UPDATE_RECHECK_EVENT, onManualCheck);
      clearInterval(timer);
    };
  }, [refreshUpdate]);

  useEffect(() => {
    if (!shouldUseAppShellClient()) return;
    return registerAppShellRouter((path) => {
      router.push(path, { scroll: true });
    });
  }, [router]);

  useEffect(() => {
    // Desktop browsers: drop sticky app-shell so the legal/VK footer stays visible.
    clearStaleDesktopAppShell();
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
            exitAppRef.current = async () => {
              await app.App.exitApp();
            };
            setExitConfirmOpen(true);
          })();
        });

        let lastHandledUrl = "";
        const handleDeepLink = async (url: string | undefined) => {
          if (!url || url === lastHandledUrl) return;
          const target = resolveAppShellDeepLink(url);
          if (!target) return;
          lastHandledUrl = url;
          if (target.includes("/auth/oauth/complete")) {
            try {
              const { Browser } = await import("@capacitor/browser");
              await Browser.close();
            } catch {
              /* browser may already be closed */
            }
          }
          window.location.replace(target);
        };

        urlListener = await app.App.addListener("appUrlOpen", (event) => {
          void handleDeepLink(event.url);
        });
        const launch = await app.App.getLaunchUrl();
        if (!cancelled) await handleDeepLink(launch?.url);

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
          onGraceContinue={() => setUpdateAvailable(null)}
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
      {exitConfirmOpen ? (
        <AppExitConfirm
          onConfirm={() => {
            setExitConfirmOpen(false);
            void exitAppRef.current?.();
          }}
          onCancel={() => setExitConfirmOpen(false)}
        />
      ) : null}
      {showTabs ? <AppShellBottomNav /> : null}
    </>
  );
}
