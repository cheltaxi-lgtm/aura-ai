"use client";

import { useId, useMemo } from "react";
import {
  AURA_CHAKRA_KEYS,
  type AuraChakraKey,
  type AuraSnapshot,
  type AuraTeaserSnapshot,
} from "@/lib/aura-constants";

/**
 * Colored map of the person's field: seven Brennan layers around a silhouette
 * plus the chakra column. Built purely from the structured snapshot — the
 * original photo is never needed and never shown here.
 *
 * Veiled (teaser) mode renders the layer palette (known pre-payment) but keeps
 * chakra states neutral: openness/colors ship only with the paid report.
 */

type AuraMapSnapshot = Pick<AuraTeaserSnapshot, "dominantColor" | "secondaryColors"> &
  Partial<Pick<AuraSnapshot, "chakras">>;

type AuraMapProps = {
  snapshot: AuraMapSnapshot;
  /** Teaser mode: chakra dots stay neutral — states are part of the paid report. */
  veiled?: boolean;
};

const CENTER_X = 110;
const CENTER_Y = 168;

/** Crown → root vertical positions on the silhouette (viewBox 220×340). */
const CHAKRA_Y: Record<AuraChakraKey, number> = {
  sahasrara: 54,
  ajna: 80,
  vishuddha: 110,
  anahata: 142,
  manipura: 172,
  svadhisthana: 200,
  muladhara: 232,
};

const VEILED_DOT = "#8a8f9a";

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

/** Innermost → outermost: dominant → secondary colors → outer white. */
function layerPalette(snapshot: AuraMapSnapshot): string[] {
  const c1 = snapshot.dominantColor.hex;
  const c2 = snapshot.secondaryColors[0]?.hex ?? c1;
  const c3 = snapshot.secondaryColors[1]?.hex ?? c2;
  const outer = "#f5f2ea";
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    if (t <= 1 / 3) return mixHex(c1, c2, t * 3);
    if (t <= 2 / 3) return mixHex(c2, c3, (t - 1 / 3) * 3);
    return mixHex(c3, outer, (t - 2 / 3) * 3);
  });
}

export default function AuraMap({ snapshot, veiled = false }: AuraMapProps) {
  const titleId = useId();
  const layers = useMemo(() => layerPalette(snapshot), [snapshot]);
  const chakras = snapshot.chakras ?? [];

  return (
    <figure className="aura-map">
      <svg
        viewBox="0 0 220 340"
        role="img"
        aria-labelledby={titleId}
        className="aura-map__svg"
      >
        <title id={titleId}>
          {veiled
            ? "Карта поля: цвета слоёв видны, состояния чакр откроются в полном разборе"
            : "Цветная карта вашего поля: семь слоёв и чакры"}
        </title>

        {layers.map((color, i) => (
          <ellipse
            key={i}
            className="aura-map__layer"
            cx={CENTER_X}
            cy={CENTER_Y}
            rx={58 + i * 7}
            ry={118 + i * 6}
            fill={color}
            fillOpacity={Math.max(0.05, 0.16 - i * 0.016)}
            stroke={color}
            strokeOpacity={Math.max(0.18, 0.5 - i * 0.05)}
            strokeWidth={1}
            style={{ animationDelay: `${i * 0.9}s` }}
          />
        ))}

        <g className="aura-map__figure" aria-hidden>
          <circle cx={CENTER_X} cy={84} r={25} />
          <path d="M110,112 C92,112 74,122 68,142 C62,162 72,186 80,208 C86,226 88,238 88,250 L132,250 C132,238 134,226 140,208 C148,186 158,162 152,142 C146,122 128,112 110,112 Z" />
        </g>

        {veiled
          ? AURA_CHAKRA_KEYS.map((key) => (
              <circle
                key={key}
                cx={CENTER_X}
                cy={CHAKRA_Y[key]}
                r={4}
                fill={VEILED_DOT}
                fillOpacity={0.45}
              />
            ))
          : chakras.map((chakra) => {
              const y = CHAKRA_Y[chakra.key];
              if (typeof y !== "number") return null;
              const open = chakra.openness === "open";
              const blocked = chakra.openness === "blocked";
              return (
                <g key={chakra.key}>
                  <title>{`${chakra.name}: ${open ? "открыта" : blocked ? "закрыта" : "в балансе"}`}</title>
                  {open && (
                    <circle cx={CENTER_X} cy={y} r={12} fill={chakra.color} fillOpacity={0.22} />
                  )}
                  {blocked && (
                    <circle
                      cx={CENTER_X}
                      cy={y}
                      r={8.5}
                      fill="none"
                      stroke={chakra.color}
                      strokeOpacity={0.5}
                      strokeDasharray="2 3"
                    />
                  )}
                  <circle
                    cx={CENTER_X}
                    cy={y}
                    r={open ? 6 : blocked ? 4 : 5}
                    fill={chakra.color}
                    fillOpacity={open ? 1 : blocked ? 0.55 : 0.85}
                  />
                </g>
              );
            })}
      </svg>
      <figcaption className="aura-map__caption">
        {veiled
          ? "Карта поля: цвета слоёв видны, состояния чакр — в полном разборе"
          : "Карта вашего поля: семь слоёв и чакры"}
      </figcaption>
    </figure>
  );
}
