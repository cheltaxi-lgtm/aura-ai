"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { HdChart, HdPublicChart } from "@/lib/human-design";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";
import HdStaticBodygraph from "./HdStaticBodygraph";

interface Props {
  /** Full chart for owners; stripped public form on share links. */
  chart: HdChart | HdPublicChart;
  subjectName?: string | null;
}

export default function HdShareCard({ chart, subjectName }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeMeta = TYPE_META[chart.type];
  // Unique gradient prefix per card instance — two cards on one page must not
  // share defs ids or both paint from the first card's gradients.
  const uid = useId().replace(/:/g, "");

  const download = useCallback(async () => {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "dizayn-cheloveka-karta.png";
      link.click();
    } catch {
      setError("Не удалось сохранить карточку. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="hd-share-card-wrap">
      <div ref={cardRef} className="hd-share-card" aria-hidden="true">
        <div className="hd-share-card__head">
          <p className="hd-share-card__brand">ZOVUS · Дизайн Человека</p>
          <p className="hd-share-card__name">{subjectName || "Моя карта"}</p>
        </div>
        <HdStaticBodygraph
          chart={chart}
          theme="dark"
          idPrefix={`share-${uid}`}
          className="hd-share-card__graph"
        />
        <div className="hd-share-card__facts">
          <div>
            <span>Тип</span>
            <strong>{typeMeta.nameRu}</strong>
          </div>
          <div>
            <span>Профиль</span>
            <strong>{chart.profile} · {PROFILE_NAMES_RU[chart.profile] ?? ""}</strong>
          </div>
          <div>
            <span>Авторитет</span>
            <strong>{AUTHORITY_NAMES_RU[chart.authority]}</strong>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-center text-xs text-red-200/90" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void download()} disabled={busy} className="hd-bodygraph__export">
        {busy ? "Генерация…" : "Скачать карточку"}
      </button>
    </div>
  );
}
