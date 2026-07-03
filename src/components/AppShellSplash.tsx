"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";
import AppShellOfflineGate from "@/components/AppShellOfflineGate";
import { shouldUseAppShellClient, isAppShellSplashDone, markAppShellSplashDone } from "@/lib/app-shell";
import {
  probeAppBootstrapConnectivity,
  probeAppConnectivity,
  type AppConnectivityReason,
} from "@/lib/app-connectivity";

const MIN_SPLASH_MS = 4_500;
const EXIT_MS = 650;
const MAX_SPLASH_MS = 9_000;

export const APP_SHELL_SPLASH_HIDDEN_EVENT = "zovus:splash-hidden";

type SplashPhase = "playing" | "blocked" | "exiting" | "done";

async function hideNativeSplash(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 320 });
  } catch {
    /* web or plugin unavailable */
  }
}

/** Premium launch animation for Capacitor / ?app=1 shell. */
export default function AppShellSplash() {
  const skipSplash = isAppShellSplashDone();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<SplashPhase>(skipSplash ? "done" : "playing");
  const [blockedReason, setBlockedReason] = useState<AppConnectivityReason>("offline");
  const [checking, setChecking] = useState(false);
  const [statusLine, setStatusLine] = useState("проверяем соединение…");
  const startedRef = useRef(0);
  const probeResultRef = useRef<AppConnectivityReason | null | "pending">("pending");
  const decidedRef = useRef(false);

  const beginExit = useCallback(() => {
    setPhase((current) => (current === "playing" ? "exiting" : current));
  }, []);

  const applyProbeResult = useCallback(
    (reason: AppConnectivityReason | null) => {
      probeResultRef.current = reason;
      if (reason) {
        setBlockedReason(reason);
        setStatusLine(
          reason === "offline"
            ? "нет интернета"
            : reason === "maintenance"
              ? "технические работы"
              : "сервер недоступен"
        );
        setPhase("blocked");
        return;
      }
      setStatusLine("готово");
      beginExit();
    },
    [beginExit]
  );

  const runBootstrapProbe = useCallback(async () => {
    setChecking(true);
    setStatusLine("проверяем соединение…");
    const reason = await probeAppBootstrapConnectivity();
    setChecking(false);
    applyProbeResult(reason);
  }, [applyProbeResult]);

  const decideAfterSplash = useCallback(() => {
    if (decidedRef.current) return;

    const result = probeResultRef.current;
    if (result === "pending") return;

    decidedRef.current = true;
    applyProbeResult(result);
  }, [applyProbeResult]);

  useEffect(() => {
    if (!shouldUseAppShellClient()) return;
    if (isAppShellSplashDone()) {
      window.dispatchEvent(new CustomEvent(APP_SHELL_SPLASH_HIDDEN_EVENT));
      return;
    }

    setVisible(true);
    startedRef.current = Date.now();
    let exitTimer: number | undefined;
    let maxTimer: number | undefined;

    const scheduleDecision = () => {
      const elapsed = Date.now() - startedRef.current;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      exitTimer = window.setTimeout(decideAfterSplash, wait);
    };

    requestAnimationFrame(() => {
      void hideNativeSplash();
    });

    void probeAppBootstrapConnectivity().then((reason) => {
      probeResultRef.current = reason;
      if (decidedRef.current) return;
      const elapsed = Date.now() - startedRef.current;
      if (elapsed >= MIN_SPLASH_MS) {
        decidedRef.current = true;
        applyProbeResult(reason);
      }
    });

    if (document.readyState === "complete") {
      scheduleDecision();
    } else {
      window.addEventListener("load", scheduleDecision, { once: true });
    }

    maxTimer = window.setTimeout(() => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      const result = probeResultRef.current;
      applyProbeResult(result === "pending" ? null : result);
    }, MAX_SPLASH_MS);

    return () => {
      if (exitTimer) window.clearTimeout(exitTimer);
      if (maxTimer) window.clearTimeout(maxTimer);
      window.removeEventListener("load", scheduleDecision);
    };
  }, [applyProbeResult, decideAfterSplash]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const timer = window.setTimeout(() => {
      markAppShellSplashDone();
      setPhase("done");
      window.dispatchEvent(new CustomEvent(APP_SHELL_SPLASH_HIDDEN_EVENT));
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const handleRetry = useCallback(() => {
    decidedRef.current = false;
    probeResultRef.current = "pending";
    setPhase("playing");
    setStatusLine("проверяем соединение…");
    void runBootstrapProbe().then(() => {
      if (probeResultRef.current === null) {
        decidedRef.current = true;
      }
    });
  }, [runBootstrapProbe]);

  if (!visible || phase === "done") return null;

  return (
    <div
      className={`app-shell-splash app-shell-splash--${phase}`}
      role="status"
      aria-live="polite"
      aria-busy={phase === "playing" || checking}
      aria-label={phase === "blocked" ? "Zovus недоступен" : "Загрузка Zovus"}
    >
      <div className="app-shell-splash__backdrop" aria-hidden>
        <div className="app-shell-splash__nebula" />
        <div className="app-shell-splash__stars" />
      </div>

      {phase === "blocked" ? (
        <AppShellOfflineGate
          reason={blockedReason}
          checking={checking}
          onRetry={handleRetry}
        />
      ) : (
        <div className="app-shell-splash__content">
          <div className="app-shell-splash__orb-wrap" aria-hidden>
            <div className="app-shell-splash__ring app-shell-splash__ring--outer" />
            <div className="app-shell-splash__ring app-shell-splash__ring--inner" />
            <div className="app-shell-splash__core">
              <BrandMark size={44} className="app-shell-splash__logo" />
            </div>
          </div>

          <p className="app-shell-splash__wordmark">ZOVUS</p>
          <p className="app-shell-splash__tagline">эзотерический оракул</p>
          <p className="app-shell-splash__status">{statusLine}</p>

          <div className="app-shell-splash__progress" aria-hidden>
            <span className="app-shell-splash__progress-bar" />
          </div>
        </div>
      )}
    </div>
  );
}
