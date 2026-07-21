"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { resetWindowScroll } from "@/lib/reset-window-scroll";

/**
 * Next.js soft navigation can leave the previous window scroll position
 * (especially with `html { scroll-behavior: smooth }`). Reset on route change;
 * leave hash targets alone so in-page anchors still work.
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (typeof window === "undefined" || window.location.hash) return;

    resetWindowScroll();
    const frame = window.requestAnimationFrame(() => resetWindowScroll());
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
