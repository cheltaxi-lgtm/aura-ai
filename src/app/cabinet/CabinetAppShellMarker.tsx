"use client";

import { useEffect } from "react";
import {
  clearAppShellFromDocument,
  isAppShellSearchParam,
  isDesktopBrowserWithoutAppShell,
  isNativeCapacitorPlatform,
} from "@/lib/app-shell";

/**
 * Temporarily mark app-shell while cabinet is mounted (hides marketing footer).
 * Must clear on leave — otherwise `/` keeps `data-app-shell` and the VK/docs
 * footer stays `display: none` after visiting кабинет.
 */
export default function CabinetAppShellMarker() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.appShell;
    root.dataset.appShell = "android";

    return () => {
      let stickySession = false;
      try {
        stickySession = sessionStorage.getItem("zovus_app_shell") === "1";
      } catch {
        stickySession = false;
      }
      const keepRealShell =
        isNativeCapacitorPlatform() ||
        isAppShellSearchParam(window.location.search) ||
        (stickySession && !isDesktopBrowserWithoutAppShell());

      if (keepRealShell) {
        root.dataset.appShell = "android";
        return;
      }
      if (previous && previous !== "android") {
        root.dataset.appShell = previous;
        return;
      }
      clearAppShellFromDocument();
    };
  }, []);

  return null;
}
