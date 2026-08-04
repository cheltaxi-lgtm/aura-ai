"use client";

import { useCallback, useRef, useState } from "react";
import type { HdChart } from "@/lib/human-design";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
} from "./bodygraph-geometry";

const COLOR_P = "#f2e7c9";
const COLOR_D = "#e05555";
const COLOR_BASE = "rgba(232, 199, 126, 0.10)";

interface Props {
  chart: HdChart;
  subjectName?: string | null;
}

/** Compact static bodygraph for the share card (no interactivity). */
function MiniBodygraph({ chart }: { chart: HdChart }) {
  const gateActivity = new Map<number, { p?: boolean; d?: boolean }>();
  for (const a of chart.personality) gateActivity.set(a.gate, { p: true });
  for (const a of chart.designActivations) {
    const e = gateActivity.get(a.gate) ?? {};
    e.d = true;
    gateActivity.set(a.gate, e);
  }
  const definedCenters = new Set(chart.definedCenters);
  const definedChannels = new Set(chart.channels.filter((c) => c.defined).map((c) => c.key));

  return (
    <svg viewBox="0 0 400 700" className="hd-share-card__graph">
      <defs>
        <linearGradient id="share-center" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8c77e" />
          <stop offset="100%" stopColor="#a8843a" />
        </linearGradient>
      </defs>
      <g strokeLinecap="round">
        {HD_CHANNEL_SEGMENTS.map((seg) => {
          const a = gateActivity.get(seg.gates[0]);
          const b = gateActivity.get(seg.gates[1]);
          const defined = definedChannels.has(seg.key);
          const aColor = a ? (a.p ? COLOR_P : COLOR_D) : COLOR_BASE;
          const bColor = b ? (b.p ? COLOR_P : COLOR_D) : COLOR_BASE;
          return (
            <g key={seg.key}>
              <line x1={seg.ax} y1={seg.ay} x2={seg.mx} y2={seg.my} stroke={aColor} strokeWidth={defined ? 5 : 3} />
              <line x1={seg.mx} y1={seg.my} x2={seg.bx} y2={seg.by} stroke={bColor} strokeWidth={defined ? 5 : 3} />
            </g>
          );
        })}
      </g>
      {Object.values(HD_CENTER_SHAPES).map((shape) => {
        const defined = definedCenters.has(shape.key);
        return (
          <path
            key={shape.key}
            d={shape.path}
            fill={defined ? "url(#share-center)" : "rgba(255,255,255,0.04)"}
            stroke={defined ? "rgba(255,232,168,0.9)" : "rgba(232,199,126,0.3)"}
            strokeWidth={1.5}
          />
        );
      })}
      <g fontFamily="system-ui, sans-serif" fontSize={9} textAnchor="middle">
        {HD_GATE_ANCHORS.map((anchor) => {
          const a = gateActivity.get(anchor.gate);
          return (
            <g key={anchor.gate}>
              <circle
                cx={anchor.lx} cy={anchor.ly} r={8}
                fill={a ? (a.d && !a.p ? COLOR_D : COLOR_P) : "#17131f"}
                stroke={a ? "rgba(255,255,255,0.5)" : "rgba(232,199,126,0.3)"}
                strokeWidth={1}
              />
              <text x={anchor.lx} y={anchor.ly + 3} fill={a ? "#17131f" : "rgba(232,199,126,0.7)"} fontWeight={a ? 700 : 400}>
                {anchor.gate}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function HdShareCard({ chart, subjectName }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const typeMeta = TYPE_META[chart.type];

  const download = useCallback(async () => {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "dizayn-cheloveka-karta.png";
      link.click();
    } catch {
      /* html-to-image unavailable or render failed */
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <div className="hd-share-card-wrap">
      <div ref={cardRef} className="hd-share-card" aria-hidden="true">
        <div className="hd-share-card__head">
          <p className="hd-share-card__brand">AURA · Дизайн Человека</p>
          <p className="hd-share-card__name">{subjectName || "Моя карта"}</p>
        </div>
        <MiniBodygraph chart={chart} />
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
      <button type="button" onClick={() => void download()} disabled={busy} className="hd-bodygraph__export">
        {busy ? "Генерация…" : "Скачать карточку"}
      </button>
    </div>
  );
}
