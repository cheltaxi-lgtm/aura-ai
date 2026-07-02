"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAndroidReleaseInfo } from "@/lib/app-shell-version";
import { markAppShellOnDocument, shouldUseAppShellClient } from "@/lib/app-shell";
import AppShellSplash from "@/components/AppShellSplash";

type CapCore = typeof import("@capacitor/core");
type CapApp = typeof import("@capacitor/app");
type CapStatusBar = typeof import("@capacitor/status-bar");
type CapSplash = typeof import("@capacitor/splash-screen");
type CapHaptics = typeof import("@capacitor/haptics");

const PULL_REFRESH_THRESHOLD = 120;

async function loadCapacitorModules(isNative: boolean) {
  if (!isNative) return null;
  const [{ Capacitor }, app, statusBar, splash, haptics] = await Promise.all([
    import("@capacitor/core") as Promise<CapCore>,
    import("@capacitor/app") as Promise<CapApp>,
    import("@capacitor/status-bar") as Promise<CapStatusBar>,
    import("@capacitor/splash-screen") as Promise<CapSplash>,
    import("@capacitor/haptics") as Promise<CapHaptics>,
  ]);
  return { Capacitor, app, statusBar, splash, haptics };
}

function UpdateGate({ apkUrl, releaseNotes }: { apkUrl: string; releaseNotes: string }) {
  return (
    <div className="app-shell-update-gate" role="alertdialog" aria-modal="true">
      <div className="app-shell-update-gate__card">
        <p className="app-shell-update-gate__title">Нужно обновление</p>
        <p className="app-shell-update-gate__body">{releaseNotes}</p>
        <a className="app-shell-update-gate__cta" href={apkUrl}>
          Скачать новую версию
        </a>
      </div>
    </div>
  );
}

export default function AppShellBridge() {
  const [offline, setOffline] = useState(false);
  const [pullVisible, setPullVisible] = useState(false);
  const [updateRequired, setUpdateRequired] = useState<{ apkUrl: string; releaseNotes: string } | null>(
    null
  );
  const pullStartY = useRef<number | null>(null);

  useEffect(() => {
    const active = shouldUseAppShellClient();
    if (active) markAppShellOnDocument();

    let backListener: { remove: () => void } | undefined;
    let urlListener: { remove: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const isNative =
        typeof window !== "undefined" &&
        Boolean(
          (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
        );

      if (!active && !isNative) return;
      markAppShellOnDocument();

      const mods = await loadCapacitorModules(isNative);
      if (cancelled) return;

      if (mods) {
        const { Capacitor, app, statusBar, splash, haptics } = mods;

        if (Capacitor.getPlatform() === "android") {
          try {
            await statusBar.StatusBar.setOverlaysWebView({ overlay: true });
            await statusBar.StatusBar.setBackgroundColor({ color: "#0b0714" });
            await statusBar.StatusBar.setStyle({ style: statusBar.Style.Dark });
          } catch {
            /* plugin unavailable */
          }
        }

        try {
          const info = await app.App.getInfo();
          const remote = await fetchAndroidReleaseInfo();
          const buildCode = Number.parseInt(String(info.build), 10);
          if (
            remote &&
            Number.isFinite(buildCode) &&
            buildCode < remote.minVersionCode
          ) {
            setUpdateRequired({ apkUrl: remote.apkUrl, releaseNotes: remote.releaseNotes });
          }
        } catch {
          /* version gate optional */
        }

        try {
          await splash.SplashScreen.hide({ fadeOutDuration: 450 });
        } catch {
          /* ignore */
        }

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
          if (event.url) window.location.href = event.url;
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
          /* biometric optional */
        }
      }
    })();

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onTouchStart = (e: TouchEvent) => {
      if (!shouldUseAppShellClient() || window.scrollY > 4) return;
      pullStartY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const start = pullStartY.current;
      if (start == null) return;
      const delta = (e.touches[0]?.clientY ?? start) - start;
      setPullVisible(delta > 48 && window.scrollY <= 4);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = pullStartY.current;
      pullStartY.current = null;
      setPullVisible(false);
      if (start == null || !shouldUseAppShellClient()) return;
      const endY = e.changedTouches[0]?.clientY ?? start;
      if (endY - start >= PULL_REFRESH_THRESHOLD && window.scrollY <= 4) {
        window.location.reload();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      cancelled = true;
      backListener?.remove();
      urlListener?.remove();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const inShell = shouldUseAppShellClient();

  return (
    <>
      <AppShellSplash />
      {inShell && pullVisible ? (
        <div className="app-shell-pull-hint app-shell-pull-hint--visible" aria-hidden>
          <span className="app-shell-pull-hint__rune">✦</span>
          Обновить
        </div>
      ) : null}
      {updateRequired ? (
        <UpdateGate apkUrl={updateRequired.apkUrl} releaseNotes={updateRequired.releaseNotes} />
      ) : null}
      {offline && inShell ? (
        <div
          className="app-shell-offline fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0b0714] px-8 text-center"
          role="alert"
        >
          <p className="font-display text-xl text-aura-champagne">Нет соединения</p>
          <p className="mt-3 max-w-sm text-sm text-gray-400">
            Проверьте интернет — Zovus работает онлайн. Карты вернутся, когда связь восстановится.
          </p>
        </div>
      ) : null}
    </>
  );
}
