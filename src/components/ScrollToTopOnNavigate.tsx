"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { resetWindowScroll } from "@/lib/reset-window-scroll";

/**
 * Soft nav and hard reload can leave the window mid-page. Always pin to top
 * unless the URL has a hash target (in-page anchors).
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || window.location.hash) return;

    resetWindowScroll();
    const frame = window.requestAnimationFrame(() => resetWindowScroll());
    // Home swaps guest/logged content after paint — brief re-pin only there.
    const timers: number[] = [];
    if (pathname === "/") {
      timers.push(window.setTimeout(() => resetWindowScroll(), 50));
      timers.push(window.setTimeout(() => resetWindowScroll(), 180));
    }
    return () => {
      window.cancelAnimationFrame(frame);
      for (const id of timers) window.clearTimeout(id);
    };
  }, [pathname]);

  return null;
}
