"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export type DailyBonusResult = {
  claimed: boolean; bonusAmount?: number; newBalance?: number; nextBonusIn?: string;
  alreadyClaimed?: boolean; currentBalance?: number; nextEligibleAt?: string; serverNow?: string;
};
export function isForegroundVisit(event: Pick<Event, "isTrusted">, visibility: string): boolean {
  return event.isTrusted && visibility === "visible";
}
export function useDailyBonus(enabled: boolean) {
  const [bonusResult, setBonusResult] = useState<DailyBonusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retryAt = useRef(0);
  const generation = useRef(0);
  const claimManually = useCallback(async (event: Pick<Event, "isTrusted">): Promise<DailyBonusResult | null> => {
    if (!enabled || busy.current || !isForegroundVisit(event, document.visibilityState) || Date.now() < retryAt.current) return null;
    const currentGeneration = generation.current;
    busy.current = true; setLoading(true); setError(null);
    try {
      const res = await fetch("/api/runes/daily", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(res.status === 429 ? "Повторите через минуту." : data.error || "Не удалось получить бонус. Попробуйте снова.");
      if (currentGeneration !== generation.current) return null;
      retryAt.current = Date.now() + Math.max(60_000, Date.parse(data.nextEligibleAt) - Date.parse(data.serverNow) || 60_000);
      setBonusResult(data);
      return data;
    } catch (cause) {
      if (currentGeneration === generation.current) {
        retryAt.current = Date.now() + 60_000;
        setError(cause instanceof Error ? cause.message : "Ошибка соединения");
      }
      return null;
    } finally {
      if (currentGeneration === generation.current) { busy.current = false; setLoading(false); }
    }
  }, [enabled]);
  useEffect(() => {
    generation.current++; busy.current = false; retryAt.current = 0;
    const activeGeneration = generation.current;
    setBonusResult(null); setLoading(false); setError(null);
    if (!enabled) return;
    // Background tabs, polling, timers and visibility changes alone never grant runes.
    const visit = (event: Event) => {
      if (isForegroundVisit(event, document.visibilityState) && Date.now() >= retryAt.current) void claimManually(event);
    };
    window.addEventListener("pointerdown", visit, { passive: true });
    window.addEventListener("keydown", visit);
    return () => {
      generation.current = activeGeneration + 1;
      window.removeEventListener("pointerdown", visit);
      window.removeEventListener("keydown", visit);
    };
  }, [enabled, claimManually]);
  return { bonusResult, loading, error, claimManually };
}
