"use client";

import { useEffect, useState } from "react";
import { shouldUseAppShellClient } from "@/lib/app-shell";

const MIN_SPLASH_MS = 900;

/** Premium in-app splash before WebView content is fully ready. */
export default function AppShellSplash() {
  const [visible, setVisible] = useState(false);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (!shouldUseAppShellClient()) return;
    setVisible(true);
    const started = Date.now();
    const finish = () => {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => setHide(true), wait);
    };
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    return () => window.removeEventListener("load", finish);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`app-shell-splash${hide ? " app-shell-splash--hide" : ""}`}
      aria-hidden={hide}
    >
      <div className="app-shell-splash__mark" aria-hidden />
      <p className="app-shell-splash__wordmark">ZOVUS</p>
      <p className="app-shell-splash__tagline">эзотерический оракул</p>
    </div>
  );
}
