"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import DailyBonusToast from "@/components/DailyBonusToast";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { useDailyBonus } from "@/hooks/useDailyBonus";

interface DailyBonusClaimerProps {
  enabled: boolean;
  suppressVerificationNotice?: boolean;
}

export default function DailyBonusClaimer({ enabled, suppressVerificationNotice = false }: DailyBonusClaimerProps) {
  const [verificationRequired, setVerificationRequired] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) {
      setVerificationRequired(null);
      return;
    }
    let alive = true;
    fetch("/api/runes/daily/status", { cache: "no-store" }).then(r=>r.ok?r.json():null)
      .then(data=>{
        if (!alive) return;
        const required = data ? data.verificationRequired === true : null;
        setVerificationRequired(required);
      })
      .catch(()=>{
        if (alive) {
          setVerificationRequired(null);
        }
      });
    return()=>{alive=false;};
  },[enabled]);
  const { bonusResult } = useDailyBonus(enabled && verificationRequired === false);
  const [showBonus, setShowBonus] = useState(false);

  useEffect(() => {
    if (!bonusResult?.claimed || typeof bonusResult.bonusAmount !== "number") return;

    if (typeof bonusResult.newBalance === "number") {
      emitRuneBalanceUpdate(bonusResult.newBalance);
    }

    setShowBonus(true);
    const timer = window.setTimeout(() => setShowBonus(false), 3000);
    return () => window.clearTimeout(timer);
  }, [bonusResult]);

  return (
    <AnimatePresence>
      {enabled && verificationRequired && !suppressVerificationNotice && <aside role="status" className="fixed bottom-24 left-4 right-4 z-40 mx-auto max-w-sm rounded-xl border border-amber-300/30 bg-slate-950 p-4 text-sm text-white">
        Подтвердите почту, чтобы получить стартовые руны. <a href="/cabinet#daily-bonus" className="text-amber-200 underline">Открыть кабинет</a>
      </aside>}
      {showBonus && bonusResult?.claimed && bonusResult.bonusAmount != null && (
        <DailyBonusToast amount={bonusResult.bonusAmount} />
      )}
    </AnimatePresence>
  );
}
