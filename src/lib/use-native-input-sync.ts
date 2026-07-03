"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Capacitor WebView can miss React onChange for Cyrillic — sync from native events.
 *
 * Uses a callback ref (not a plain object ref + effect) so the listener is (re)attached
 * exactly when the DOM node mounts. Fields that mount conditionally — e.g. a textarea
 * shown only after picking a step in a multi-step flow — don't exist yet when a
 * mount-only `useEffect` runs, so an object-ref version of this hook would silently
 * never attach and typing would appear to do nothing.
 */
export function useNativeInputSync<T extends HTMLInputElement | HTMLTextAreaElement>(
  setValue: (value: string) => void
) {
  const nodeRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback(
    (node: T | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      nodeRef.current = node;
      if (!node) return;

      const sync = () => setValue(node.value);
      node.addEventListener("input", sync);
      node.addEventListener("change", sync);
      node.addEventListener("compositionend", sync);

      cleanupRef.current = () => {
        node.removeEventListener("input", sync);
        node.removeEventListener("change", sync);
        node.removeEventListener("compositionend", sync);
      };
    },
    [setValue]
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  if (!Object.prototype.hasOwnProperty.call(setRef, "current")) {
    Object.defineProperty(setRef, "current", {
      get: () => nodeRef.current,
      configurable: true,
    });
  }

  return setRef as typeof setRef & { current: T | null };
}
