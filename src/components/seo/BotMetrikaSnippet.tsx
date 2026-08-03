"use client";

import { useEffect } from "react";
import { isSearchEngineBot } from "@/lib/seo/indexability";

const YANDEX_METRIKA_ID = 110138367;
const TAG_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`;

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/**
 * Search-bot UAs only: load Metrika so Yandex can verify the counter.
 * Humans keep consent-gated YandexMetrika. Does not call headers() (keeps SSG).
 */
export default function BotMetrikaSnippet() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!isSearchEngineBot(navigator.userAgent)) return;
    if (document.querySelector(`script[src="${TAG_SRC}"]`)) return;

    const ym = function (...args: unknown[]) {
      (ym.a = ym.a || []).push(args);
    } as ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
    ym.l = Date.now();
    window.ym = ym as Window["ym"];

    const s = document.createElement("script");
    s.async = true;
    s.src = TAG_SRC;
    document.head.appendChild(s);

    try {
      window.ym?.(YANDEX_METRIKA_ID, "init", {
        clickmap: false,
        trackLinks: true,
        accurateTrackBounce: true,
        webvisor: false,
      });
    } catch {
      /* optional */
    }
  }, []);

  return null;
}
