"use client";

import { useEffect, useRef, useState } from "react";

export type DailyBonusResult = {
  claimed: boolean;
  bonusAmount?: number;
  newBalance?: number;
  nextBonusIn?: string;
  alreadyClaimed?: boolean;
  currentBalance?: number;
};

export function useDailyBonus(enabled: boolean) {
  const [bonusResult, setBonusResult] = useState<DailyBonusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || attemptedRef.current) return;
    attemptedRef.current = true;

    const claimBonus = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/runes/daily", { method: "POST" });
        if (!res.ok) return;
        const data = (await res.json()) as DailyBonusResult;
        setBonusResult(data);
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    };

    void claimBonus();
  }, [enabled]);

  const claimManually = async (): Promise<DailyBonusResult | null> => {
    setLoading(true);
    try {
      const res = await fetch("/api/runes/daily", { method: "POST" });
      if (!res.ok) return null;
      const data = (await res.json()) as DailyBonusResult;
      setBonusResult(data);
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { bonusResult, loading, claimManually };
}
