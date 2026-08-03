"use client";

import DeckCardsRow from "@/components/DeckCardsRow";
import ShareCardFrame from "@/components/share/ShareCardFrame";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";
import { DEFAULT_DECK_SYSTEM, type DeckSystem } from "@/lib/decks";
import { getDeckPositionsForUi } from "@/lib/decks";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardTriplet({ payload, aspect }: Props) {
  const system = (payload.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;
  const cards = payload.cards ?? [];
  const positions = getDeckPositionsForUi(system);

  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-triplet">
        <p className="share-card-triplet__eyebrow">Бесплатный расклад · 3 карты</p>
        <h2 className="share-card-triplet__title">{payload.title}</h2>
        {payload.userName && (
          <p className="share-card-triplet__user">Для {payload.userName}</p>
        )}
        {cards.length > 0 && (
          <div className="share-card-triplet__cards">
            <DeckCardsRow
              cards={cards.map((c) => ({ name: c.name, meaning: c.meaning }))}
              system={system}
              size="sm"
              showMeaning={false}
              enableDetail={false}
              positions={cards.map((c, i) => c.position ?? positions[i] ?? `Карта ${i + 1}`)}
            />
          </div>
        )}
        {payload.excerpt && (
          <p className="share-card-triplet__excerpt">&ldquo;{payload.excerpt}&rdquo;</p>
        )}
      </div>
    </ShareCardFrame>
  );
}
