"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  MASTER_VISUAL,
  RITUAL_VISUAL,
  needsReview,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import type { RitualClientData } from "@/components/ritual/RitualCard";

const DISMISS_KEY = "cabinet-ritual-review-banner-dismissed";

interface Props {
  onReview: (ritualId: string, characterKey: RitualMasterKey) => void;
}

export default function CabinetRitualReviewBanner({ onReview }: Props) {
  const [ritual, setRitual] = useState<RitualClientData | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    void (async () => {
      const res = await fetch("/api/ritual/list", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const rituals = (data.rituals ?? []) as RitualClientData[];
      const pending = rituals.find((r) => needsReview(r));
      setRitual(pending ?? null);
    })();
  }, []);

  if (dismissed || !ritual) return null;

  const master = MASTER_VISUAL[ritual.characterKey as RitualMasterKey];
  const typeVis = RITUAL_VISUAL[ritual.ritualType as RitualType];

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-100">
            ⏳ {master?.name ?? "Мастер"} ждёт твоего ответа
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Прошло 7 дней с {typeVis?.label.toLowerCase() ?? "обряда"}
          </p>
          <p className="text-xs text-amber-200/70">Были знаки?</p>
          <button
            type="button"
            onClick={() =>
              onReview(ritual.id, ritual.characterKey as RitualMasterKey)
            }
            className="cabinet-btn cabinet-btn--primary mt-3 text-xs"
          >
            Поделиться результатом →
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Закрыть"
          className="shrink-0 text-amber-200/60 hover:text-amber-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
