"use client";

import ShareCardFrame from "@/components/share/ShareCardFrame";
import type { ShareCardAspect } from "@/lib/share/card-layout";
import type { SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload;
  aspect: ShareCardAspect;
}

export default function ShareCardJoint({ payload, aspect }: Props) {
  return (
    <ShareCardFrame aspect={aspect}>
      <div className="share-card-ritual">
        <p className="share-card-ritual__eyebrow">💞 Совместный расклад Zovus</p>

        <h2 className="share-card-ritual__title">{payload.title}</h2>

        {payload.date && <p className="share-card-ritual__date">{payload.date}</p>}

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
