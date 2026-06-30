"use client";

import { MasterAvatarInline } from "@/components/MasterAvatar";
import DeckCardsRow from "@/components/DeckCardsRow";
import ShareCardFrame from "@/components/share/ShareCardFrame";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";
import { DEFAULT_DECK_SYSTEM, type DeckSystem } from "@/lib/decks";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardReading({ payload, aspect }: Props) {
  const system = (payload.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;
  const cards = payload.cards ?? [];

  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-reading">
        <p className="share-card-reading__eyebrow">Расклад Zovus</p>
        {payload.masterKey && (
          <div className="share-card-reading__master">
            <MasterAvatarInline
              masterId={payload.masterKey}
              masterName={payload.masterName ?? payload.masterKey}
              size="sm"
            />
            <span>{payload.masterName}</span>
          </div>
        )}
        <h2 className="share-card-reading__title">{payload.title}</h2>
        {payload.date && <p className="share-card-reading__date">{payload.date}</p>}
        {cards.length > 0 && (
          <div className="share-card-reading__cards">
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
        {payload.excerpt && (
          <p className="share-card-reading__excerpt">&ldquo;{payload.excerpt}&rdquo;</p>
        )}
      </div>
    </ShareCardFrame>
  );
}
