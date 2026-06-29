"use client";

import {
  getSpread,
  listSpreads,
  type SpreadId,
} from "@/lib/spreads";
import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem } from "@/lib/decks";
import type { SessionTopicId } from "@/lib/session-topics";
import RuneCost from "@/components/RuneCost";
import { useRuneConfig } from "@/lib/useRuneConfig";

interface SpreadPickerProps {
  selectedId: SpreadId;
  onSelect: (id: SpreadId) => void;
  masterId?: string;
  topic?: SessionTopicId | null;
  disabled?: boolean;
}

export default function SpreadPicker({
  selectedId,
  onSelect,
  masterId,
  topic,
  disabled,
}: SpreadPickerProps) {
  const { config, cost: runeCost } = useRuneConfig();
  const system = resolveMasterDeckSystem(masterId);
  const spreads = listSpreads({ topic: topic ?? undefined, system });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {spreads.map((spread) => {
        const active = spread.id === selectedId;
        const spreadCost = Math.max(
          1,
          Math.round(runeCost("INTENTION_SPREAD") * spread.costMultiplier)
        );

        return (
          <button
            key={spread.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelect(spread.id);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("spread_selected", { detail: { spreadId: spread.id } })
                );
              }
            }}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? "border-aura-gold/60 bg-aura-gold/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            } disabled:opacity-50`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-white">{spread.label}</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs text-aura-gold">
                {spread.cardCount} {spread.cardCount === 1 ? "карта" : "карт"}
              </span>
            </div>
            <p className="mb-2 text-sm text-white/60">{spread.description}</p>
            {config.enabled ? (
              <RuneCost cost={spreadCost} enabled className="text-xs text-white/50" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
