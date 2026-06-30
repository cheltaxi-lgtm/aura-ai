"use client";

import { MasterAvatarInline } from "@/components/MasterAvatar";
import type { SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload;
  shareUrl?: string;
}

const KIND_LABEL: Record<SharePayload["kind"], string> = {
  reading: "Расклад Zovus",
  session: "Сеанс Zovus",
  daily: "Энергия дня",
  triplet: "Расклад · 3 карты",
  ritual: "Ритуал",
};

export default function SharePreviewCard({ payload, shareUrl }: Props) {
  const cards = payload.cards ?? [];
  const label = payload.ritualLabel ?? KIND_LABEL[payload.kind] ?? "Zovus";

  return (
    <article className="share-preview-card">
      <div className="share-preview-card__frame">
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
        {payload.date && <p className="share-preview-card__meta">{payload.date}</p>}
        {payload.userName && (
          <p className="share-preview-card__meta">Для {payload.userName}</p>
        )}
        {cards.length > 0 && (
          <ul className="share-preview-card__card-list">
            {cards.map((card, i) => (
              <li key={`${card.name}-${i}`} className="share-preview-card__card-chip">
                {card.position && (
                  <span className="share-preview-card__card-pos">{card.position}</span>
                )}
                <span className="share-preview-card__card-name">{card.name}</span>
              </li>
            ))}
          </ul>
        )}
        {payload.excerpt && (
          <div className="share-preview-card__excerpt-wrap">
            <p className="share-preview-card__excerpt">{payload.excerpt}</p>
          </div>
        )}
        {shareUrl && (
          <p className="share-preview-card__link">{shareUrl.replace(/^https?:\/\//, "")}</p>
        )}
      </div>
      <p className="share-preview-card__brand">Zovus.ru</p>
    </article>
  );
}
