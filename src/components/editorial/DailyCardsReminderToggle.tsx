"use client";

import { useEffect, useState } from "react";
import { trackReminderOpt } from "@/lib/seo/product-funnel";

/** Explicit opt-in for future 3-cards-of-the-day reminders. Server is authority. */
export default function DailyCardsReminderToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/daily-cards-reminder", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { dailyCardsReminder?: boolean };
        if (!cancelled) setEnabled(data.dailyCardsReminder === true);
      } catch {
        /* keep default OFF */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: boolean) => {
    if (saving) return;
    const prev = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/daily-cards-reminder", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCardsReminder: next }),
      });
      if (!res.ok) {
        setEnabled(prev);
        return;
      }
      const data = (await res.json()) as { dailyCardsReminder?: boolean };
      const saved = data.dailyCardsReminder === true;
      setEnabled(saved);
      trackReminderOpt(saved);
    } catch {
      setEnabled(prev);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <label className={className ?? "personal-zovus__reminder"}>
      <input
        type="checkbox"
        checked={enabled}
        disabled={saving}
        onChange={(e) => void save(e.target.checked)}
      />
      Напоминать о 3 картах дня
    </label>
  );
}
