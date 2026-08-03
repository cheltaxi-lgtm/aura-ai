"use client";

import { useEffect, useRef, useState } from "react";

type UseScrollRevealOptions = {
  threshold?: number;
  rootMargin?: string;
  /** Reveal once (default true). */
  once?: boolean;
  /** If true, reveal on mount without waiting for IO (hero). */
  immediate?: boolean;
};

/**
 * One-shot scroll reveal for salon landing sections.
 * Adds `salon-reveal` / `salon-reveal--in` — CSS handles motion.
 * Respects prefers-reduced-motion (final state, no transition).
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  options: UseScrollRevealOptions = {}
) {
  const { threshold = 0.18, rootMargin = "0px 0px -6% 0px", once = true, immediate = false } =
    options;
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || immediate) {
      // Double-rAF so CSS can paint the initial state before --in (unless reduced).
      if (reduce.matches) {
        setRevealed(true);
        return;
      }
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setRevealed(true));
      });
      return () => window.cancelAnimationFrame(id);
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      setRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRevealed(true);
        if (once) io.disconnect();
      },
      { threshold, rootMargin }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold, rootMargin, once, immediate]);

  const className = `salon-reveal${revealed ? " salon-reveal--in" : ""}`;
  return { ref, revealed, className };
}
