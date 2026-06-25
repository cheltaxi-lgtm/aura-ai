"use client";

import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import DeckCardsRow from "@/components/DeckCardsRow";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { reconcileSpreadDeck } from "@/lib/spread-context";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";
import { redrawSpreadToTarotCards } from "@/lib/photo-spread-redraw";

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
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}

export default function MySpreadsGallery({
  entries,
  masterLabel,
  onOpen,
  onDelete,
  deletingId = null,
}: MySpreadsGalleryProps) {
  if (!entries.length) {
    return (
      <p className="text-sm text-gray-600">
        Фото-раскладов пока нет —{" "}
        <Link href="/?photo=1" className="btn-luxe btn-luxe--sm btn-luxe--gold">
          загрузите первый
        </Link>
      </p>
    );
  }

  return (
    <div className="my-spreads-gallery">
      {entries.map((entry) => {
        const spread = entry.contextData.redrawSpread;
        const rawCards = spread?.cards.length
          ? redrawSpreadToTarotCards(spread)
          : (entry.contextData.tarotCards ??
              spread?.cards.map((c) => ({
                name: c.reversed ? `${c.name} (перев.)` : c.name,
                meaning: c.shortMeaning,
                reversed: c.reversed,
                imagePath: c.imagePath,
                placeholder: c.placeholder,
                originalName: c.originalName,
              })) ??
              []);
        const spreadDisplay =
          rawCards.length > 0
            ? reconcileSpreadDeck(
                entry.contextData.deckSystem ?? spread?.system ?? DEFAULT_DECK_SYSTEM,
                rawCards
              )
            : null;
        const cards = spreadDisplay?.cards ?? rawCards;
        const system = spreadDisplay?.system ?? entry.contextData.deckSystem ?? spread?.system ?? DEFAULT_DECK_SYSTEM;
        const preview = cards;

        const rawTheme =
          entry.contextData.spreadType?.split("·")[0]?.trim() ??
          entry.contextData.deckType?.split("·")[0]?.trim() ??
          "Расклад";
        const theme = rawTheme.replace(/^["«]+|["»]+$/g, "").trim() || "Расклад";

        return (
          <div key={entry.id} className="my-spreads-card relative text-left">
            {onDelete ? (
              <button
                type="button"
                disabled={deletingId === entry.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(entry.id);
                }}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-gray-400 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-40"
                aria-label="Удалить фото-расклад"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button type="button" onClick={() => onOpen(entry.id)} className="block w-full text-left">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-aura-gold">
                  {masterLabel(entry.characterName)}
                </p>
                <p className="font-display mt-0.5 text-base leading-snug text-aura-ivory">{theme}</p>
              </div>
              <time className="shrink-0 text-[11px] text-gray-500">
                {new Date(entry.createdAt).toLocaleDateString("ru")}
              </time>
            </div>

            {preview.length > 0 && (
              <div className="my-spreads-card__preview">
                <DeckCardsRow
                  cards={preview}
                  system={system}
                  masterId={entry.characterName}
                  size="sm"
                  aligned
                  showMeaning={false}
                  enableDetail={false}
                />
                {cards.length > 6 && (
                  <p className="mt-3 text-center text-[11px] text-aura-champagne/70">
                    {cards.length} символов в раскладе
                  </p>
                )}
              </div>
            )}

            <p className="my-spreads-card__excerpt">
              {entry.contextData.analysis ?? entry.contextData.question ?? "Расклад Zovus"}
            </p>
            <span className="my-spreads-card__more">
              <span>Открыть расшифровку</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
