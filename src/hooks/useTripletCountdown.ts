"use client";

import { useEffect, useState } from "react";
import { formatCountdownHMS, formatTripletCooldownRu } from "@/lib/triplet-limit";

export function useTripletCountdown(nextAvailableAt: string | null | undefined) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!nextAvailableAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [nextAvailableAt]);

  if (!nextAvailableAt) {
    return {
      isOnCooldown: false,
      hms: "00:00:00",
      hintRu: "",
      tooltip: "",
    };
  }

  const ms = new Date(nextAvailableAt).getTime() - Date.now();
  const isOnCooldown = ms > 0;

  return {
    isOnCooldown,
    hms: formatCountdownHMS(ms),
    hintRu: isOnCooldown ? `Новый расклад из 3 карт ${formatTripletCooldownRu(nextAvailableAt)}` : "",
    tooltip: isOnCooldown
      ? `Следующий расклад будет доступен через ${formatCountdownHMS(ms)}`
      : "",
    tick,
  };
}
