"use client";

import { formatSpreadUnitRu } from "@/lib/spread-ritual-copy";
import {
  CUSTOM_QUESTION_SPREAD_TIERS,
  getSpread,
  listSpreads,
  logSpreadMetric,
  spreadMatchesSystem,
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
  const customTiers = topic === "custom" ? CUSTOM_QUESTION_SPREAD_TIERS : null;
  const spreads = customTiers
    ? customTiers
        .map((tier) => {
          const spread = getSpread(tier.id);
          if (!spreadMatchesSystem(spread, system)) return null;
          return { ...spread, tierLabel: tier.tierLabel };
        })
        .filter((spread): spread is NonNullable<typeof spread> => spread !== null)
    : listSpreads({ topic: topic ?? undefined, system }).map((spread) => ({
        ...spread,
        tierLabel: null as string | null,
      }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {spreads.map((spread) => {
        const active = spread.id === selectedId;
        const spreadCost = Math.max(
          1,
          Math.round(runeCost("INTENTION_SPREAD") * spread.costMultiplier)
        );
        const title = spread.tierLabel ?? spread.label;

        return (
          <button
            key={spread.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelect(spread.id);
              logSpreadMetric("spread_selected", {
                spreadId: spread.id,
                source: "spread_picker",
                cardCount: spread.cardCount,
              });
            }}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? "border-aura-gold/60 bg-aura-gold/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            } disabled:opacity-50`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-white">{title}</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs text-aura-gold">
                {formatSpreadUnitRu(spread.cardCount, masterId ?? "veronika", "nominative")}
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
