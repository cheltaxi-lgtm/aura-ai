"use client";

import { MotionConfig } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { detectMotionLite } from "@/lib/motion-lite";

/** WebView: skip framer-motion fades — IntersectionObserver often never fires. */
export default function AppMotionConfig({ children }: { children: ReactNode }) {
  const [lite, setLite] = useState(() =>
    typeof window !== "undefined" ? detectMotionLite() : false
  );

  useEffect(() => {
    const sync = () => setLite(detectMotionLite());
    sync();

    const widthMq = window.matchMedia("(max-width: 768px)");
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    widthMq.addEventListener("change", sync);
    reduceMq.addEventListener("change", sync);

    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-app-shell", "data-motion-lite"],
    });

    return () => {
      widthMq.removeEventListener("change", sync);
      reduceMq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);

  return (
    <MotionConfig
      reducedMotion={lite ? "always" : "user"}
      // Only force zero-duration in motion-lite / reduced shells — a global
      // duration:0 made desktop transitions pop and feel jumpy.
      {...(lite ? { transition: { duration: 0 } } : {})}
    >
      {children}
    </MotionConfig>
  );
}
