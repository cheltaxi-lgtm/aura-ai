"use client";

import ShareCardFrame from "@/components/share/ShareCardFrame";
import { getCharacterById } from "@/lib/characters";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardRitual({ payload, aspect }: Props) {
  const cfg = payload.ritualType ? RITUAL_TYPES[payload.ritualType as RitualType] : null;
  const master = payload.masterKey ? getCharacterById(payload.masterKey) : null;
  const label = payload.ritualLabel ?? cfg?.label ?? payload.title;

  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-ritual">
        <p className="share-card-ritual__master">{master?.name ?? payload.masterName}</p>
        <h2 className="share-card-ritual__title">
          {cfg?.emoji ?? "✨"} {label}
        </h2>
        {payload.date && <p className="share-card-ritual__date">{payload.date}</p>}
        {(payload.moonPhase || payload.moonSign) && (
          <p className="share-card-ritual__moon">
            {payload.moonPhase}
            {payload.moonPhase && payload.moonSign ? " в " : ""}
            {payload.moonSign}
          </p>
        )}
        {payload.cards && payload.cards.length > 0 && (
          <p className="share-card-ritual__cards">
            {payload.cards.map((c) => c.name).join(" · ")}
          </p>
        )}
        {payload.excerpt && <p className="share-card-ritual__excerpt">{payload.excerpt}</p>}
      </div>
    </ShareCardFrame>
  );
}
