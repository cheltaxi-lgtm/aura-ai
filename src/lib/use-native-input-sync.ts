"use client";

import { useEffect, useRef } from "react";

/** Capacitor WebView can miss React onChange for Cyrillic — sync from native events. */
export function useNativeInputSync<T extends HTMLInputElement | HTMLTextAreaElement>(
  setValue: (value: string) => void
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => setValue(el.value);
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
    el.addEventListener("compositionend", sync);

    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("change", sync);
      el.removeEventListener("compositionend", sync);
    };
  }, [setValue]);

  return ref;
}
