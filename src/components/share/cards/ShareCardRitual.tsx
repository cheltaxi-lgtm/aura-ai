"use client";

import { MasterAvatarInline } from "@/components/MasterAvatar";
import ShareCardFrame from "@/components/share/ShareCardFrame";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardRitual({ payload, aspect }: Props) {
  const cfg = payload.ritualType ? RITUAL_TYPES[payload.ritualType as RitualType] : null;
  const label = payload.ritualLabel ?? cfg?.label ?? payload.title;
  const moonLine = [payload.moonPhase, payload.moonSign ? `в ${payload.moonSign}` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-ritual">
        <p className="share-card-ritual__eyebrow">🕯 Обряд Zovus</p>

        {payload.masterKey && (
          <div className="share-card-ritual__master">
            <MasterAvatarInline
              masterId={payload.masterKey}
              masterName={payload.masterName ?? payload.masterKey}
              size="sm"
            />
            <span>{payload.masterName}</span>
          </div>
        )}

        <h2 className="share-card-ritual__title">
          {cfg?.emoji ?? "✨"} {label}
        </h2>

        {(payload.date || moonLine) && (
          <div className="share-card-ritual__meta">
            {payload.date && <span>{payload.date}</span>}
            {payload.date && moonLine && <span className="share-card-ritual__meta-dot" />}
            {moonLine && <span>🌙 {moonLine}</span>}
          </div>
        )}

        {payload.cards && payload.cards.length > 0 && (
          <p className="share-card-ritual__cards">
            {payload.cards.map((c) => c.name).join(" · ")}
          </p>
        )}

        {payload.excerpt && (
          <div className="share-card-ritual__quote">
            <span className="share-card-ritual__quote-line" />
            <p>{payload.excerpt}</p>
          </div>
        )}
      </div>
    </ShareCardFrame>
  );
}
