"use client";

import { useEffect, useRef, useState } from "react";
import { trackRetentionOptIn } from "@/lib/seo/product-funnel";
import {
  RETENTION_OPTIN_COPY,
  type RetentionOptInSurface,
} from "@/lib/retention-optin-shared";

type Snapshot = {
  marketingConsent?: boolean;
  eligible?: boolean;
};

type RetentionOptInCardProps = {
  surface: RetentionOptInSurface;
  /** prompt = home / post-value (cooldown). settings = cabinet, always if consent off. */
  variant?: "prompt" | "settings";
};

export default function RetentionOptInCard({
  surface,
  variant = "prompt",
}: RetentionOptInCardProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const shownSent = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/profile/retention-optin", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
        if (cancelled) return;
        const show =
          variant === "settings"
            ? data.marketingConsent !== true
            : data.eligible === true;
        if (!show) return;
        setVisible(true);
        if (variant === "prompt" && !shownSent.current) {
          shownSent.current = true;
          trackRetentionOptIn("retention_optin_shown", {
            surface,
            topic: "personal_reminders",
          });
          void fetch("/api/profile/retention-optin", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "shown", surface }),
          }).catch(() => undefined);
        }
      } catch {
        /* keep hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface, variant]);

  const submit = async (action: "accept" | "decline") => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/retention-optin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, surface }),
      });
      if (!res.ok) return;
      trackRetentionOptIn(
        action === "accept" ? "retention_optin_accepted" : "retention_optin_declined",
        { surface, topic: "personal_reminders" }
      );
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <aside className="retention-optin" aria-label="Напоминания Zovus">
      <p className="retention-optin__title">{RETENTION_OPTIN_COPY.title}</p>
      <p className="retention-optin__text">{RETENTION_OPTIN_COPY.description}</p>
      <p className="retention-optin__hint">{RETENTION_OPTIN_COPY.choice}</p>
      <div className="retention-optin__actions">
        <button
          type="button"
          className="retention-optin__accept"
          disabled={busy}
          onClick={() => void submit("accept")}
        >
          {RETENTION_OPTIN_COPY.accept}
        </button>
        {variant === "prompt" ? (
          <button
            type="button"
            className="retention-optin__decline"
            disabled={busy}
            onClick={() => void submit("decline")}
          >
            {RETENTION_OPTIN_COPY.decline}
          </button>
        ) : (
          <p className="retention-optin__hint">{RETENTION_OPTIN_COPY.cabinetHint}</p>
        )}
      </div>
    </aside>
  );
}
