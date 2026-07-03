"use client";

import { motion } from "framer-motion";
import type { DeckSystem } from "@/lib/decks/types";
import DeckCard from "@/components/DeckCard";

interface SpreadTablePickerProps {
  tableSize: number;
  cardCount: number;
  system: DeckSystem;
  masterId: string;
  pickedIndices: number[];
  onPick: (index: number) => void;
  disabled?: boolean;
  pickHint?: string;
}

function gridClass(tableSize: number): string {
  if (tableSize <= 9) return "grid-cols-3";
  return "grid-cols-4";
}

export default function SpreadTablePicker({
  tableSize,
  cardCount,
  system,
  masterId,
  pickedIndices,
  onPick,
  disabled = false,
  pickHint,
}: SpreadTablePickerProps) {
  const slots = Array.from({ length: tableSize }, (_, i) => i);
  const pickComplete = pickedIndices.length >= cardCount;

  return (
    <div>
      <p className="text-center text-sm text-white/60">
        {pickHint ?? `Выберите ${cardCount} ${cardCount === 1 ? "символ" : cardCount < 5 ? "символа" : "символов"} — порядок касаний задаёт позиции в раскладе`}
      </p>
      <p className="mt-2 text-center text-xs uppercase tracking-widest text-amber-400/80">
        Выбрано {pickedIndices.length}/{cardCount}
      </p>

      <div className={`mt-6 grid ${gridClass(tableSize)} gap-3 sm:gap-4`}>
        {slots.map((index) => {
          const order = pickedIndices.indexOf(index);
          const selected = order >= 0;
          return (
            <motion.button
              key={index}
              type="button"
              disabled={disabled || pickComplete || selected}
              onClick={() => onPick(index)}
              className={`relative rounded-xl transition-all ${
                selected
                  ? "ring-2 ring-amber-400/90 ring-offset-2 ring-offset-black/80"
                  : pickComplete
                    ? "opacity-40"
                    : "hover:ring-1 hover:ring-white/25"
              } ${disabled ? "pointer-events-none opacity-50" : ""}`}
              whileTap={!selected && !pickComplete && !disabled ? { scale: 0.97 } : undefined}
              aria-label={
                selected
                  ? `Выбрано, позиция ${order + 1}`
                  : `Карта на столе ${index + 1}`
              }
            >
              <DeckCard
                card={{ name: "?", meaning: "" }}
                system={system}
                masterId={masterId}
                size="sm"
                faceDown
                hideCaption
                interactive={false}
              />
              {selected ? (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-black">
                  {order + 1}
                </span>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
