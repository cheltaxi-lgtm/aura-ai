"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import DailyBonusToast from "@/components/DailyBonusToast";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { useDailyBonus } from "@/hooks/useDailyBonus";

interface DailyBonusClaimerProps {
  enabled: boolean;
}

export default function DailyBonusClaimer({ enabled }: DailyBonusClaimerProps) {
  const { bonusResult } = useDailyBonus(enabled);
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
      {showBonus && bonusResult?.claimed && bonusResult.bonusAmount != null && (
        <DailyBonusToast amount={bonusResult.bonusAmount} />
      )}
    </AnimatePresence>
  );
}
