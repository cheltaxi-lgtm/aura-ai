"use client";

import { Moon } from "lucide-react";
import DeckCardsRow from "@/components/DeckCardsRow";
import ShareCardFrame from "@/components/share/ShareCardFrame";
import { masterDisplay } from "@/lib/cabinet-utils";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";
import { DEFAULT_DECK_SYSTEM, type DeckSystem } from "@/lib/decks";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardDaily({ payload, aspect }: Props) {
  const system = (payload.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;
  const cards = payload.cards ?? [];
  const master = payload.masterKey ? masterDisplay(payload.masterKey) : null;

  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-daily">
        <div className="share-card-daily__icon">
          <Moon className="h-6 w-6 text-amber-300" aria-hidden />
        </div>
        <p className="share-card-daily__eyebrow">Энергия дня</p>
        <h2 className="share-card-daily__title">{payload.title}</h2>
        {master && (
          <p className="share-card-daily__master">
            {master.emoji} {master.name}
          </p>
        )}
        {payload.date && <p className="share-card-daily__date">{payload.date}</p>}
        {cards.length > 0 && (
          <div className="share-card-daily__cards">
            <DeckCardsRow
              cards={cards.map((c) => ({ name: c.name, meaning: c.meaning }))}
              system={system}
              masterId={payload.masterKey}
              size="sm"
              showMeaning={false}
              enableDetail={false}
              positions={cards.map((c) => c.position ?? c.name)}
            />
          </div>
        )}
        {payload.excerpt && <p className="share-card-daily__excerpt">{payload.excerpt}</p>}
      </div>
    </ShareCardFrame>
  );
}
