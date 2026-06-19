"use client";

import Link from "next/link";
import DeckCardsRow from "@/components/DeckCardsRow";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";

export interface MySpreadEntry {
  id: string;
  characterName: string;
  createdAt: string;
  contextData: {
    analysis?: string;
    deckType?: string;
    spreadType?: string;
    deckSystem?: DeckSystem;
    tarotCards?: { name: string; meaning?: string }[];
    redrawSpread?: RedrawSpread;
    question?: string;
  };
}

interface MySpreadsGalleryProps {
  entries: MySpreadEntry[];
  masterLabel: (id: string) => string;
  onOpen: (id: string) => void;
}

export default function MySpreadsGallery({
  entries,
  masterLabel,
  onOpen,
}: MySpreadsGalleryProps) {
  if (!entries.length) {
    return (
      <p className="text-sm text-gray-600">
        Фото-раскладов пока нет —{" "}
        <Link href="/?photo=1" className="text-aura-neon hover:underline">
          загрузите первый
        </Link>
      </p>
    );
  }

  return (
    <div className="my-spreads-gallery">
      {entries.map((entry) => {
        const spread = entry.contextData.redrawSpread;
        const cards =
          entry.contextData.tarotCards ??
          spread?.cards.map((c) => ({
            name: c.reversed ? `${c.name} (перев.)` : c.name,
            meaning: c.shortMeaning,
          })) ??
          [];
        const system = entry.contextData.deckSystem ?? spread?.system ?? DEFAULT_DECK_SYSTEM;
        const theme =
          entry.contextData.spreadType?.split("·")[0]?.trim() ??
          entry.contextData.deckType?.split("·")[0]?.trim() ??
          "Расклад";

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
            className="my-spreads-card text-left"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-aura-gold">
                  {masterLabel(entry.characterName)}
                </p>
                <p className="font-display text-sm text-aura-ivory">{theme}</p>
              </div>
              <time className="shrink-0 text-[10px] text-gray-500">
                {new Date(entry.createdAt).toLocaleDateString("ru")}
              </time>
            </div>

            {cards.length > 0 && (
              <div className="my-spreads-card__preview">
                <DeckCardsRow
                  cards={cards.slice(0, 3)}
                  system={system}
                  masterId={entry.characterName}
                  size="sm"
                  showMeaning={false}
                  enableDetail={false}
                />
                {cards.length > 3 && (
                  <p className="mt-2 text-center text-[10px] text-aura-champagne/60">
                    +{cards.length - 3} символов
                  </p>
                )}
              </div>
            )}

            <p className="line-clamp-2 text-xs leading-relaxed text-gray-400">
              {entry.contextData.analysis ?? entry.contextData.question ?? "Расклад Aura"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
