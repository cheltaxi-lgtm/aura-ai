"use client";

import { useEffect, useState } from "react";
import { formatCountdownHMS, formatTripletCooldownRu } from "@/lib/triplet-limit";

type CountdownView = {
  isOnCooldown: boolean;
  hms: string;
  hintRu: string;
  tooltip: string;
};

const IDLE_COUNTDOWN: CountdownView = {
  isOnCooldown: false,
  hms: "00:00:00",
  hintRu: "",
  tooltip: "",
};

function buildCountdownView(nextAvailableAt: string): CountdownView {
  const ms = new Date(nextAvailableAt).getTime() - Date.now();
  const isOnCooldown = ms > 0;
  return {
    isOnCooldown,
    hms: formatCountdownHMS(ms),
    hintRu: isOnCooldown ? `Новый расклад из 3 карт ${formatTripletCooldownRu(nextAvailableAt)}` : "",
    tooltip: isOnCooldown
      ? `Следующий расклад будет доступен через ${formatCountdownHMS(ms)}`
      : "",
  };
}

/** Cooldown display isolated from parent renders — updates locally once per second. */
export function useTripletCountdown(nextAvailableAt: string | null | undefined) {
  const [view, setView] = useState<CountdownView>(() =>
    nextAvailableAt ? buildCountdownView(nextAvailableAt) : IDLE_COUNTDOWN
  );

  useEffect(() => {
    if (!nextAvailableAt) {
      setView(IDLE_COUNTDOWN);
      return;
    }

    const update = () => setView(buildCountdownView(nextAvailableAt));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [nextAvailableAt]);

  return view;
}
