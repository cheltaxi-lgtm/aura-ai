"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { getDeckDefinition } from "@/lib/decks";
import { DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";
import { masterTagline } from "@/data/master-avatars";
import MasterAvatar from "@/components/MasterAvatar";

interface MasterDecksSectionProps {
  masters: ShowcaseMaster[];
  onBrowseDeck: (master: ShowcaseMaster) => void;
}

export default function MasterDecksSection({ masters, onBrowseDeck }: MasterDecksSectionProps) {
  const deckMasters = useMemo(
    () => masters.filter((m) => m.system && getDeckDefinition(m.system).symbols.length > 0),
    [masters]
  );

  if (!deckMasters.length) return null;

  return (
    <section id="колоды" className="scroll-mt-24 py-4">
      <div className="mb-8 text-center">
        <p className="lux-label mb-2 flex items-center justify-center gap-2">
          <Layers className="h-3.5 w-3.5" />
          Колоды Aura
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-gray-300 md:text-3xl">
          Полные наборы карт по мастерам
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
          Просмотрите всю колоду каждого наставника — руны, таро, славянские знаки и астрология.
          Без расхода дневного расклада.
        </p>
      </div>

      <div className="master-decks-grid">
        {deckMasters.map((master) => {
          const count = getDeckDefinition(master.system).symbols.length;
          const unit = DECK_SYSTEM_LABEL[master.system];
          return (
            <article key={master.id} className="master-decks-card">
              <MasterAvatar masterId={master.id} masterName={master.name} size="lg" hoverZoom />
              <div className="master-decks-card__body">
                <h3 className="font-display text-lg font-semibold text-aura-ivory">{master.name}</h3>
                <p className="text-xs text-aura-champagne/80">{master.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-aura-ivory/45">
                  {masterTagline(master.id, master.specialty)}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-aura-gold/70">
                  {count} {unit}
                </p>
                <button
                  type="button"
                  onClick={() => onBrowseDeck(master)}
                  className="btn-ghost mt-4 w-full py-2.5 text-xs"
                >
                  Смотреть колоду
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
