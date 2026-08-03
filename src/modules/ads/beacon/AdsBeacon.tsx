"use client";

import { useEffect, useRef } from "react";

type Props = { enabled: boolean };

function sendEvent(type: string) {
  try {
    void fetch("/api/ads/e", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Observes guest funnel without mutating product logic.
 * - deck_view: html[data-guest-spread-active]
 * - card_pick: MutationObserver on "(N/3)" counter text
 * - spread_submit / teaser_view: fetch wrapper on guest-triplet APIs
 */
export default function AdsBeacon({ enabled }: Props) {
  const deckSent = useRef(false);
  const lastPick = useRef(0);
  const linked = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams(window.location.search);
    const yclid = params.get("yclid") || params.get("ysclid");
    const hasUtm = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].some(
      (k) => params.get(k)
    );
    if (yclid || hasUtm) {
      void fetch("/api/ads/t", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yclid: yclid || undefined,
          utm_source: params.get("utm_source") || undefined,
          utm_medium: params.get("utm_medium") || undefined,
          utm_campaign: params.get("utm_campaign") || undefined,
          utm_content: params.get("utm_content") || undefined,
          utm_term: params.get("utm_term") || undefined,
          landing_path: window.location.pathname || "/",
        }),
      });
    }

    void fetch("/api/ads/link", { method: "POST", credentials: "include" }).then(() => {
      linked.current = true;
    });

    const watchDeck = () => {
      const active = document.documentElement.dataset.guestSpreadActive === "1";
      if (active && !deckSent.current) {
        deckSent.current = true;
        sendEvent("deck_view");
      }
      if (!active) deckSent.current = false;
    };
    watchDeck();
    const attrObs = new MutationObserver(watchDeck);
    attrObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-guest-spread-active"],
    });

    const pickObs = new MutationObserver(() => {
      const text = document.body?.innerText || "";
      const m = text.match(/\((\d)\s*\/\s*3\)/);
      if (!m) return;
      const n = Number(m[1]);
      if (n > lastPick.current && n <= 3) {
        for (let i = lastPick.current; i < n; i++) sendEvent("card_pick");
        lastPick.current = n;
      }
    });
    pickObs.observe(document.body, { childList: true, subtree: true, characterData: true });

    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const res = await orig(input, init);
      try {
        if (url.includes("/api/guest-triplet/complete") && init?.method === "POST" && res.ok) {
          sendEvent("spread_submit");
        }
        if (url.includes("/api/guest-triplet/teaser") && init?.method === "POST" && res.ok) {
          sendEvent("teaser_view");
        }
      } catch {
        /* ignore */
      }
      return res;
    };

    return () => {
      attrObs.disconnect();
      pickObs.disconnect();
      window.fetch = orig;
    };
  }, [enabled]);

  return null;
}
