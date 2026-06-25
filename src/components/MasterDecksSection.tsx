"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { getDeckDefinition, resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";
import { masterTagline } from "@/data/master-avatars";
import MasterAvatar from "@/components/MasterAvatar";

interface MasterDecksSectionProps {
  masters: ShowcaseMaster[];
  onBrowseDeck: (master: ShowcaseMaster) => void;
  /** When true, renders without page section wrapper (for modal). */
  embedded?: boolean;
}

export default function MasterDecksSection({
  masters,
  onBrowseDeck,
  embedded = false,
}: MasterDecksSectionProps) {
  const deckMasters = useMemo(
    () =>
      masters
        .map((m) => ({ ...m, system: m.system ?? resolveMasterDeckSystem(m.id) }))
        .filter((m) => getDeckDefinition(m.system).symbols.length > 0),
    [masters]
  );

  if (!deckMasters.length) return null;

  const content = (
    <>
      <div className={`text-center ${embedded ? "mb-4" : "mb-8"}`}>
        {!embedded ? (
          <p className="lux-label mb-2 flex items-center justify-center gap-2">
            <Layers className="h-3.5 w-3.5" />
            Колоды Zovus
          </p>
        ) : null}
        <h2
          id={embedded ? "master-decks-modal-title" : undefined}
          className={`font-display font-semibold tracking-tight text-gray-300 ${
            embedded ? "text-lg sm:text-xl" : "text-2xl md:text-3xl"
          }`}
        >
          {embedded ? "Колоды мастеров" : "Полные наборы карт по мастерам"}
        </h2>
        <p
          className={`mx-auto max-w-2xl text-gray-500 ${
            embedded ? "mt-1.5 text-xs leading-snug" : "mt-3 text-sm leading-relaxed"
          }`}
        >
          {embedded
            ? "Просмотр без расхода дневного расклада."
            : "Просмотрите всю колоду каждого наставника — руны, таро, славянские знаки и астрология. Без расхода дневного расклада."}
        </p>
      </div>

      <div className={`master-decks-grid ${embedded ? "master-decks-grid--modal" : ""}`}>
        {deckMasters.map((master) => {
          const count = getDeckDefinition(master.system).symbols.length;
          const unit = DECK_SYSTEM_LABEL[master.system];
          return (
            <article
              key={master.id}
              className={`master-decks-card ${embedded ? "master-decks-card--compact" : ""}`}
            >
              <MasterAvatar
                masterId={master.id}
                masterName={master.name}
                size={embedded ? "md" : "lg"}
                hoverZoom={!embedded}
              />
              <div className="master-decks-card__body">
                <h3
                  className={`font-display font-semibold text-aura-ivory ${
                    embedded ? "text-sm" : "text-lg"
                  }`}
                >
                  {master.name}
                </h3>
                <p className={`text-aura-champagne/80 ${embedded ? "text-[10px]" : "text-xs"}`}>
                  {master.title}
                </p>
                {!embedded ? (
                  <p className="master-decks-card__tagline mt-1 text-xs text-aura-ivory/45">
                    {masterTagline(master.id, master.specialty)}
                  </p>
                ) : null}
                <p
                  className={`uppercase tracking-wider text-aura-gold/70 ${
                    embedded ? "mt-1 text-[9px]" : "mt-2 text-[10px]"
                  }`}
                >
                  {count} {unit}
                </p>
                <div className={`master-decks-card__actions ${embedded ? "master-decks-card__actions--compact" : ""}`}>
                  <button
                    type="button"
                    onClick={() => onBrowseDeck(master)}
                    className={`btn-ghost w-full ${embedded ? "py-2 text-[11px]" : "py-2.5 text-xs"}`}
                  >
                    Смотреть колоду
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <section id="колоды" className="scroll-mt-24 py-4">
      {content}
    </section>
  );
}
