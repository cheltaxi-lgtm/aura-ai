"use client";

import { useEffect, useRef } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasCookieConsent,
  type CookieConsentValue,
} from "@/lib/cookie-consent";

const YANDEX_METRIKA_ID = 110138367;
const TAG_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`;

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

/**
 * Load Metrika only after analytics consent («Принять аналитику»).
 * Necessary-only choice keeps tag.js / clickmap / webvisor off — matches privacy §8.
 */
function ensureYmStub(): void {
  if (typeof window === "undefined") return;
  if (typeof window.ym === "function") return;
  const ym = function (...args: unknown[]) {
    (ym.a = ym.a || []).push(args);
  } as ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
  ym.l = Date.now();
  window.ym = ym as Window["ym"];
}

function injectTagScript(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${TAG_SRC}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = TAG_SRC;
  document.head.appendChild(s);
}

function initMetrikaFull(): void {
  if (typeof window === "undefined" || !window.ym) return;
  try {
    window.ym(YANDEX_METRIKA_ID, "init", {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: "dataLayer",
      accurateTrackBounce: true,
      trackLinks: true,
      referrer: document.referrer,
      url: location.href,
    });
  } catch {
    /* optional */
  }
}

function enableAnalyticsIfConsented(): void {
  if (!hasCookieConsent()) return;
  ensureYmStub();
  injectTagScript();
  initMetrikaFull();
}

export default function YandexMetrika() {
  const booted = useRef(false);

  useEffect(() => {
    if (hasCookieConsent()) {
      enableAnalyticsIfConsented();
      booted.current = true;
    }

    const onConsent = (e: Event) => {
      const value = (e as CustomEvent<{ value?: CookieConsentValue }>).detail?.value;
      if (value === "1" || hasCookieConsent()) {
        enableAnalyticsIfConsented();
        booted.current = true;
      }
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  // No beforeInteractive script / noscript pixel — analytics only after explicit consent.
  return null;
}
