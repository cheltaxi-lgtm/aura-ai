"use client";

import { useEffect, useState } from "react";
import type { Transition, VariantLabels, TargetAndTransition } from "framer-motion";
import { readAppShellFromDocument, shouldUseAppShellClient } from "@/lib/app-shell";

/** Skip scroll-triggered fades in WebView / mobile — IntersectionObserver is unreliable there. */
export function detectMotionLite(): boolean {
  if (typeof window === "undefined") return false;
  if (readAppShellFromDocument() || shouldUseAppShellClient()) return true;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    if (window.matchMedia("(max-width: 768px)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function useMotionLite(): boolean {
  const [lite, setLite] = useState(() => detectMotionLite());

  useEffect(() => {
    const sync = () => setLite(detectMotionLite());
    sync();

    const widthMq = window.matchMedia("(max-width: 768px)");
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    widthMq.addEventListener("change", sync);
    reduceMq.addEventListener("change", sync);

    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-shell"] });

    return () => {
      widthMq.removeEventListener("change", sync);
      reduceMq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);

  return lite;
}

type MotionRevealOptions = {
  delay?: number;
  duration?: number;
  y?: number;
  scale?: number;
};

export type MotionRevealProps = {
  initial: false | TargetAndTransition;
  animate?: TargetAndTransition | VariantLabels;
  whileInView?: TargetAndTransition | VariantLabels;
  viewport?: { once?: boolean };
  transition?: Transition;
};

/** Scroll-reveal: in lite mode force visible via `animate` (no whileInView). */
export function motionInViewProps(lite: boolean, opts: MotionRevealOptions = {}): MotionRevealProps {
  const y = opts.y ?? 16;
  const delay = opts.delay ?? 0;
  const duration = opts.duration ?? 0.45;

  if (lite) {
    const animate: TargetAndTransition = { opacity: 1, y: 0 };
    if (opts.scale != null) animate.scale = 1;
    return { initial: false, animate };
  }

  const initial: TargetAndTransition = { opacity: 0, y };
  if (opts.scale != null) initial.scale = opts.scale;

  return {
    initial,
    whileInView: { opacity: 1, y: 0, ...(opts.scale != null ? { scale: 1 } : {}) },
    viewport: { once: true },
    transition: { delay, duration, ease: [0.22, 1, 0.36, 1] },
  };
}

/** Mount fade-in (hero, banners). */
export function motionEnterProps(lite: boolean, opts: MotionRevealOptions = {}): MotionRevealProps {
  const y = opts.y ?? 12;
  const delay = opts.delay ?? 0;
  const duration = opts.duration ?? 0.35;

  if (lite) {
    const animate: TargetAndTransition = { opacity: 1, y: 0 };
    if (opts.scale != null) animate.scale = 1;
    return { initial: false, animate };
  }

  const initial: TargetAndTransition = { opacity: 0, y };
  if (opts.scale != null) initial.scale = opts.scale;

  return {
    initial,
    animate: { opacity: 1, y: 0, ...(opts.scale != null ? { scale: 1 } : {}) },
    transition: { delay, duration, ease: [0.22, 1, 0.36, 1] },
  };
}
