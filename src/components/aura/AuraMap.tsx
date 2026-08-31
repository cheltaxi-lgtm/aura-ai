"use client";

import { useId, useMemo } from "react";
import {
  AURA_CHAKRA_KEYS,
  AURA_CHAKRA_NAMES,
  AURA_LAYER_KEYS,
  AURA_LAYER_NAMES,
  type AuraChakraKey,
  type AuraSnapshot,
  type AuraTeaserSnapshot,
} from "@/lib/aura-constants";

/**
 * Labeled field map: Brennan layers + yogic chakras + color meanings.
 * Built only from the structured snapshot — the original photo is never shown.
 */

type AuraMapSnapshot = Pick<AuraTeaserSnapshot, "dominantColor" | "secondaryColors"> &
  Partial<Pick<AuraSnapshot, "chakras" | "layers">>;

type AuraMapProps = {
  snapshot: AuraMapSnapshot;
  /** Teaser: colors and layer names only — chakra states stay paid. */
  veiled?: boolean;
};

const CENTER_X = 160;
const CENTER_Y = 168;

const CHAKRA_Y: Record<AuraChakraKey, number> = {
  sahasrara: 54,
  ajna: 80,
  vishuddha: 110,
  anahata: 142,
  manipura: 172,
  svadhisthana: 200,
  muladhara: 232,
};

const LAYER_ROLE: Record<(typeof AURA_LAYER_KEYS)[number], string> = {
  etheric: "тело, жизненная сила",
  emotional: "чувства к себе",
  mental: "мысли и установки",
  astral: "связи и сердце",
  etheric_template: "воля и форма",
  celestial: "вдохновение",
  causal: "высший план",
};

const OPENNESS_RU = {
  open: "открыта",
  balanced: "в балансе",
  blocked: "закрыта",
} as const;

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
  const palette = [snapshot.dominantColor, ...snapshot.secondaryColors];

  return (
    <figure className="aura-map">
      <svg
        viewBox="0 0 320 340"
        role="img"
        aria-labelledby={titleId}
        className="aura-map__svg"
      >
        <title id={titleId}>
          {veiled
            ? "Карта поля: цвета и слои видны, состояния чакр — в полном разборе"
            : "Цветная карта поля: семь слоёв, чакры и значения цветов"}
        </title>

        {layers.map((color, i) => {
          const rx = 62 + i * 9;
          const ry = 122 + i * 8;
          return (
            <ellipse
              key={`layer-${i}`}
              className="aura-map__layer"
              cx={CENTER_X}
              cy={CENTER_Y}
              rx={rx}
              ry={ry}
              fill={color}
              fillOpacity={Math.max(0.12, 0.34 - i * 0.03)}
              stroke={color}
              strokeOpacity={Math.max(0.35, 0.72 - i * 0.06)}
              strokeWidth={1.6}
              style={{ animationDelay: `${i * 0.9}s` }}
            />
          );
        })}
        {layers.map((color, i) => {
          const rx = 62 + i * 9;
          const ry = 122 + i * 8;
          return (
            <text
              key={`n-${i}`}
              className="aura-map__layer-n"
              x={CENTER_X + rx + 6}
              y={CENTER_Y - ry * 0.55}
              fill={color}
              fontSize={11}
              fontWeight={600}
            >
              {i + 1}
            </text>
          );
        })}

        <g className="aura-map__figure" aria-hidden>
          <circle cx={CENTER_X} cy={84} r={25} />
          <path d="M160,112 C142,112 124,122 118,142 C112,162 122,186 130,208 C136,226 138,238 138,250 L182,250 C182,238 184,226 190,208 C198,186 208,162 202,142 C196,122 178,112 160,112 Z" />
        </g>

        {veiled
          ? AURA_CHAKRA_KEYS.map((key) => (
              <circle
                key={key}
                cx={CENTER_X}
                cy={CHAKRA_Y[key]}
                r={5}
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
                  <title>{`${chakra.name}: ${OPENNESS_RU[chakra.openness]}`}</title>
                  {open && (
                    <circle cx={CENTER_X} cy={y} r={13} fill={chakra.color} fillOpacity={0.28} />
                  )}
                  {blocked && (
                    <circle
                      cx={CENTER_X}
                      cy={y}
                      r={9}
                      fill="none"
                      stroke={chakra.color}
                      strokeOpacity={0.55}
                      strokeDasharray="2 3"
                    />
                  )}
                  <circle
                    cx={CENTER_X}
                    cy={y}
                    r={open ? 6.5 : blocked ? 4.5 : 5.5}
                    fill={chakra.color}
                    fillOpacity={open ? 1 : blocked ? 0.55 : 0.9}
                  />
                </g>
              );
            })}
      </svg>

      <figcaption className="aura-map__caption">
        {veiled
          ? "Цвета поля видны сразу. Состояния чакр откроются в полном разборе."
          : "Карта поля: цвет — качество, слой — глубина, чакра — где ресурс или блок."}
      </figcaption>

      <ul className="aura-map__palette">
        {palette.map((color, i) => (
          <li key={color.key} className="aura-map__swatch">
            <span
              className="aura-map__swatch-dot"
              style={{ backgroundColor: color.hex, color: color.hex }}
            />
            <span>
              <span className="aura-map__swatch-name">
                {i === 0 ? "Ядро · " : "Оттенок · "}
                {color.name}
              </span>
              {color.meaning ? (
                <span className="aura-map__swatch-meaning">{color.meaning}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="aura-map__keys">
        <div>
          <p className="aura-map__keys-title">Семь слоёв</p>
          <ol className="aura-map__key-list">
            {AURA_LAYER_KEYS.map((key, i) => {
              const found = snapshot.layers?.find((l) => l.key === key);
              const name = found?.name ?? AURA_LAYER_NAMES[key];
              const state = !veiled && found?.state ? found.state : LAYER_ROLE[key];
              return (
                <li key={key} className="aura-map__key">
                  <span
                    className="aura-map__key-dot"
                    style={{ backgroundColor: layers[i], color: layers[i] }}
                  />
                  <span>
                    <span className="aura-map__key-name">
                      {i + 1}. {name}
                    </span>
                    <span className="aura-map__key-state">{state}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div>
          <p className="aura-map__keys-title">Чакры</p>
          <ol className="aura-map__key-list">
            {[...AURA_CHAKRA_KEYS].reverse().map((key) => {
              const found = chakras.find((c) => c.key === key);
              const name = found?.name ?? AURA_CHAKRA_NAMES[key];
              if (veiled) {
                return (
                  <li key={key} className="aura-map__key">
                    <span
                      className="aura-map__key-dot aura-map__key-dot--veiled"
                      style={{ backgroundColor: VEILED_DOT }}
                    />
                    <span>
                      <span className="aura-map__key-name">{name}</span>
                      <span className="aura-map__key-state">в полном разборе</span>
                    </span>
                  </li>
                );
              }
              const openness = found?.openness ?? "balanced";
              return (
                <li key={key} className="aura-map__key">
                  <span
                    className="aura-map__key-dot"
                    style={{
                      backgroundColor: found?.color ?? VEILED_DOT,
                      color: found?.color ?? VEILED_DOT,
                    }}
                  />
                  <span>
                    <span className="aura-map__key-name">{name}</span>
                    <span className="aura-map__key-state">
                      {OPENNESS_RU[openness]}
                      {found?.note ? ` — ${found.note}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </figure>
  );
}
