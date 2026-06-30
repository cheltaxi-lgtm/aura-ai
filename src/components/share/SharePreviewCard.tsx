"use client";

import DeckCardsRow from "@/components/DeckCardsRow";
import { MasterAvatarInline } from "@/components/MasterAvatar";
import { DEFAULT_DECK_SYSTEM, type DeckSystem } from "@/lib/decks";
import type { SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload;
}

const KIND_LABEL: Record<SharePayload["kind"], string> = {
  reading: "Расклад Zovus",
  session: "Сеанс Zovus",
  daily: "Энергия дня",
  triplet: "Расклад · 3 карты",
  ritual: "Ритуал",
};

export default function SharePreviewCard({ payload }: Props) {
  const system = (payload.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;
  const cards = payload.cards ?? [];
  const label = payload.ritualLabel ?? KIND_LABEL[payload.kind] ?? "Zovus";

  return (
    <article className="share-preview-card">
      <p className="share-preview-card__eyebrow">{label}</p>
      {payload.masterKey && (
        <div className="share-preview-card__master">
          <MasterAvatarInline
            masterId={payload.masterKey}
            masterName={payload.masterName ?? payload.masterKey}
            size="sm"
          />
          {payload.masterName && <span>{payload.masterName}</span>}
        </div>
      )}
      <h3 className="share-preview-card__title">{payload.title}</h3>
      {payload.date && <p className="share-preview-card__date">{payload.date}</p>}
      {payload.userName && (
        <p className="share-preview-card__user">Для {payload.userName}</p>
      )}
      {cards.length > 0 && (
        <div className="share-preview-card__cards">
          <DeckCardsRow
            cards={cards.map((c) => ({ name: c.name, meaning: c.meaning }))}
            system={system}
            masterId={payload.masterKey}
            size="sm"
            showMeaning={false}
            enableDetail={false}
            positions={cards.map((c, i) => c.position ?? `Карта ${i + 1}`)}
          />
        </div>
      )}
      {payload.excerpt && (
        <p className="share-preview-card__excerpt">{payload.excerpt}</p>
      )}
      <p className="share-preview-card__brand">Zovus.ru</p>
    </article>
  );
}
