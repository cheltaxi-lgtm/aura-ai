"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  AURA_CHAKRA_KEYS,
  AURA_CHAKRA_NAMES,
  AURA_LAYER_KEYS,
  AURA_LAYER_NAMES,
  AURA_VERDICT_LABELS,
  type AuraChakraKey,
  type AuraSnapshot,
  type AuraTeaserSnapshot,
} from "@/lib/aura-constants";
import {
  AURA_BODY_PATH,
  AURA_CHAKRA_POS,
  AURA_HEAD,
  AURA_LAYER_BLUR,
  AURA_LAYER_PATHS,
  AURA_VIZ_VB,
} from "@/components/aura/aura-viz-geometry";

/**
 * Premium field visualization. Reads only the structured snapshot —
 * the original photo is never shown.
 */

type AuraMapSnapshot = Pick<AuraTeaserSnapshot, "dominantColor" | "secondaryColors" | "verdict" | "teaser"> &
  Partial<Pick<AuraSnapshot, "chakras" | "layers">>;

type AuraMapProps = {
  snapshot: AuraMapSnapshot;
  /** Teaser: colors and layer names only — chakra states stay paid. */
  veiled?: boolean;
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
  const outer = mixHex(c3, "#1a1224", 0.25);
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    if (t <= 1 / 3) return mixHex(c1, c2, t * 3);
    if (t <= 2 / 3) return mixHex(c2, c3, (t - 1 / 3) * 3);
    return mixHex(c3, outer, (t - 2 / 3) * 3);
  });
}

function firstClause(text: string): string {
  return text.split(/[,—–]/)[0]?.trim() || text.trim();
}

function asSentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const body = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(body) ? body : `${body}.`;
}

function firstSentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts) return text.trim();
  return parts.slice(0, n).join(" ").replace(/\s+/g, " ").trim();
}

function headlineOf(snapshot: AuraMapSnapshot): { title: string; sub: string } {
  const core = snapshot.dominantColor;
  const outer = snapshot.secondaryColors[0];
  const title = outer
    ? `${asSentence(firstClause(core.meaning))} Снаружи — ${firstClause(outer.meaning).toLowerCase()}.`
    : asSentence(core.meaning);
  const teaser = snapshot.teaser?.trim();
  const sub = teaser
    ? firstSentences(teaser, 2)
    : outer
      ? asSentence(outer.meaning)
      : "";
  return { title, sub };
}

function useFineHover(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setOk(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return ok;
}

const LAYER_ORIGINS = [
  { cx: "50%", cy: "42%" },
  { cx: "40%", cy: "36%" },
  { cx: "58%", cy: "28%" },
  { cx: "44%", cy: "46%" },
  { cx: "56%", cy: "38%" },
  { cx: "38%", cy: "50%" },
  { cx: "52%", cy: "40%" },
] as const;

function layerFillOpacity(index: number, hex: string): { inner: number; mid: number } {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const lift = lum < 0.32 ? 0.18 : lum > 0.82 ? -0.12 : 0;
  const inner = Math.min(0.92, Math.max(0.42, 0.78 - index * 0.06 + lift));
  const mid = Math.min(0.55, Math.max(0.16, 0.4 - index * 0.04 + lift * 0.5));
  return { inner, mid };
}

export default function AuraMap({ snapshot, veiled = false }: AuraMapProps) {
  const uid = useId().replace(/:/g, "");
  const layers = useMemo(() => layerPalette(snapshot), [snapshot]);
  const chakras = snapshot.chakras ?? [];
  const outer = snapshot.secondaryColors[0] ?? snapshot.dominantColor;
  const copy = headlineOf(snapshot);
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [focusChakra, setFocusChakra] = useState<AuraChakraKey | null>(null);
  const [locked, setLocked] = useState(false);
  const fineHover = useFineHover();

  const chakraCounts = veiled
    ? null
    : chakras.reduce(
        (acc, c) => {
          acc[c.openness] += 1;
          return acc;
        },
        { open: 0, balanced: 0, blocked: 0 }
      );

  const focusedChakra = focusChakra
    ? chakras.find((c) => c.key === focusChakra) ?? null
    : null;
  const focusedLayerKey =
    focusLayer !== null ? AURA_LAYER_KEYS[focusLayer] : null;
  const focusedLayer = focusedLayerKey
    ? snapshot.layers?.find((l) => l.key === focusedLayerKey)
    : undefined;

  function toggleLayer(i: number) {
    setFocusChakra(null);
    if (focusLayer === i && locked) {
      setFocusLayer(null);
      setLocked(false);
      return;
    }
    setFocusLayer(i);
    setLocked(true);
  }

  function toggleChakra(key: AuraChakraKey) {
    setFocusLayer(null);
    if (focusChakra === key && locked) {
      setFocusChakra(null);
      setLocked(false);
      return;
    }
    setFocusChakra(key);
    setLocked(true);
  }

  function hoverLayer(i: number | null) {
    if (!fineHover || locked) return;
    setFocusChakra(null);
    setFocusLayer(i);
  }

  function hoverChakra(key: AuraChakraKey | null) {
    if (!fineHover || locked) return;
    setFocusLayer(null);
    setFocusChakra(key);
  }

  return (
    <figure className="aura-map">
      <header className="aura-map__intro">
        <p className="aura-map__eyebrow">
          Ваша аура
          <span> · {AURA_VERDICT_LABELS[snapshot.verdict]}</span>
        </p>
        <h2 className="aura-map__headline">{copy.title}</h2>
        <p className="aura-map__lead">{copy.sub}</p>
      </header>

      <div className="aura-map__stage">
        <div className="aura-viz">
          <svg
            viewBox={`0 0 ${AURA_VIZ_VB.w} ${AURA_VIZ_VB.h}`}
            className="aura-viz__svg"
            role="img"
            aria-labelledby={`${uid}-title`}
          >
            <title id={`${uid}-title`}>
              {veiled
                ? "Энергетическое поле вокруг фигуры: цвета ядра и внешнего слоя. Состояния чакр — в полном разборе."
                : "Энергетическая аура вокруг человеческого тела: семь слоёв поля и чакры."}
            </title>
            <defs>
              {AURA_LAYER_BLUR.map((dev, i) => (
                <filter
                  key={i}
                  id={`${uid}-blur-${i}`}
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                >
                  <feGaussianBlur stdDeviation={dev} />
                </filter>
              ))}
              <radialGradient id={`${uid}-body`} cx="40%" cy="20%" r="78%">
                <stop offset="0%" stopColor={snapshot.dominantColor.hex} stopOpacity="0.62" />
                <stop offset="38%" stopColor={mixHex(snapshot.dominantColor.hex, "#2a2438", 0.45)} stopOpacity="0.72" />
                <stop offset="100%" stopColor="#1c1628" stopOpacity="0.92" />
              </radialGradient>
              <radialGradient id={`${uid}-core`} cx="50%" cy="34%" r="38%">
                <stop offset="0%" stopColor={snapshot.dominantColor.hex} stopOpacity="0.38" />
                <stop offset="100%" stopColor={snapshot.dominantColor.hex} stopOpacity="0" />
              </radialGradient>
              {layers.map((color, i) => {
                const op = layerFillOpacity(i, color);
                const origin = LAYER_ORIGINS[i];
                return (
                  <radialGradient
                    key={i}
                    id={`${uid}-lg-${i}`}
                    cx={origin.cx}
                    cy={origin.cy}
                    r="70%"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={op.inner} />
                    <stop offset="62%" stopColor={color} stopOpacity={op.mid} />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </radialGradient>
                );
              })}
            </defs>

            <ellipse
              className="aura-viz__core-glow"
              cx="200"
              cy="210"
              rx="46"
              ry="88"
              fill={`url(#${uid}-core)`}
            />

            {[...AURA_LAYER_PATHS].reverse().map((d, rev) => {
              const i = AURA_LAYER_PATHS.length - 1 - rev;
              const dimmed = focusLayer !== null && focusLayer !== i;
              const hot = focusLayer === i;
              const name = snapshot.layers?.[i]?.name ?? AURA_LAYER_NAMES[AURA_LAYER_KEYS[i]];
              const state =
                !veiled && snapshot.layers?.[i]?.state
                  ? snapshot.layers[i].state
                  : LAYER_ROLE[AURA_LAYER_KEYS[i]];
              return (
                <g
                  key={AURA_LAYER_KEYS[i]}
                  className={`aura-viz__layer${dimmed ? " is-dim" : ""}${hot ? " is-hot" : ""}`}
                  style={{ animationDelay: `${i * 0.7}s` }}
                >
                  <path
                    className="aura-viz__layer-fill"
                    d={d}
                    fill={`url(#${uid}-lg-${i})`}
                    filter={`url(#${uid}-blur-${i})`}
                    pointerEvents="none"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={layers[i]}
                    strokeOpacity={hot ? 0.5 : i >= 5 ? 0.08 : i >= 3 ? 0.16 : 0.28}
                    strokeWidth={hot ? 1.55 : 1}
                    pointerEvents="none"
                  />
                  <path
                    d={d}
                    className="aura-viz__layer-hit"
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`${name}: ${state}`}
                    aria-pressed={hot}
                    onClick={() => toggleLayer(i)}
                    onPointerEnter={() => hoverLayer(i)}
                    onPointerLeave={() => hoverLayer(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleLayer(i);
                      }
                    }}
                  />
                </g>
              );
            })}

            <g className="aura-viz__body" aria-hidden>
              <ellipse
                cx={AURA_HEAD.cx}
                cy={AURA_HEAD.cy}
                rx={AURA_HEAD.rx}
                ry={AURA_HEAD.ry}
                fill={`url(#${uid}-body)`}
              />
              <path d={AURA_BODY_PATH} fill={`url(#${uid}-body)`} />
              <ellipse
                cx={AURA_HEAD.cx}
                cy={AURA_HEAD.cy}
                rx={AURA_HEAD.rx}
                ry={AURA_HEAD.ry}
                fill="none"
                stroke={snapshot.dominantColor.hex}
                strokeOpacity="0.58"
                strokeWidth="1.25"
              />
              <path
                d={AURA_BODY_PATH}
                fill="none"
                stroke={snapshot.dominantColor.hex}
                strokeOpacity="0.42"
                strokeWidth="1.15"
              />
            </g>

            {(veiled ? AURA_CHAKRA_KEYS : chakras.map((c) => c.key)).map((key) => {
              const pos = AURA_CHAKRA_POS[key];
              const found = chakras.find((c) => c.key === key);
              const color = veiled ? VEILED_DOT : found?.color ?? VEILED_DOT;
              const openness = found?.openness ?? "balanced";
              const open = !veiled && openness === "open";
              const blocked = !veiled && openness === "blocked";
              const label = found?.name ?? AURA_CHAKRA_NAMES[key];
              const hint = veiled
                ? "состояние откроется в полном разборе"
                : `${OPENNESS_RU[openness]}${found?.note ? ` — ${found.note}` : ""}`;
              return (
                <g key={key} className="aura-viz__chakra">
                  {open ? (
                    <circle cx={pos.x} cy={pos.y} r={18} fill={color} fillOpacity={0.22} />
                  ) : null}
                  {!veiled && !blocked ? (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={9}
                      fill="none"
                      stroke={color}
                      strokeOpacity={open ? 0.45 : 0.28}
                      strokeWidth="1.1"
                      pointerEvents="none"
                    />
                  ) : null}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={28}
                    className="aura-viz__chakra-hit"
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`${label}: ${hint}`}
                    aria-pressed={focusChakra === key}
                    onClick={() => toggleChakra(key)}
                    onPointerEnter={() => hoverChakra(key)}
                    onPointerLeave={() => hoverChakra(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleChakra(key);
                      }
                    }}
                  />
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={open ? 6.5 : blocked ? 4.2 : 5.4}
                    fill={color}
                    fillOpacity={veiled ? 0.4 : blocked ? 0.55 : 1}
                    stroke={blocked ? color : "none"}
                    strokeDasharray={blocked ? "2 3" : undefined}
                    strokeOpacity={0.7}
                    pointerEvents="none"
                  />
                </g>
              );
            })}
          </svg>

          {focusLayer !== null && focusedLayerKey ? (
            <div className="aura-viz__tip" role="status">
              <p className="aura-viz__tip-kicker">Слой</p>
              <p className="aura-viz__tip-title">
                {focusedLayer?.name ?? AURA_LAYER_NAMES[focusedLayerKey]}
              </p>
              <p className="aura-viz__tip-body">
                {!veiled && focusedLayer?.state
                  ? focusedLayer.state
                  : LAYER_ROLE[focusedLayerKey]}
              </p>
            </div>
          ) : null}

          {focusChakra ? (
            <div className="aura-viz__tip" role="status">
              <p className="aura-viz__tip-kicker">Чакра</p>
              <p className="aura-viz__tip-title">
                {focusedChakra?.name ?? AURA_CHAKRA_NAMES[focusChakra]}
              </p>
              <p className="aura-viz__tip-body">
                {veiled
                  ? "Состояние откроется в полном разборе."
                  : `${OPENNESS_RU[focusedChakra?.openness ?? "balanced"]}${
                      focusedChakra?.note ? ` — ${focusedChakra.note}` : ""
                    }`}
              </p>
            </div>
          ) : null}
        </div>

        <ul className="aura-map__palette">
          <li className="aura-map__card">
            <span
              className="aura-map__orb"
              style={{
                backgroundColor: snapshot.dominantColor.hex,
                color: snapshot.dominantColor.hex,
              }}
            />
            <span>
              <span className="aura-map__card-kicker">Ядро</span>
              <span className="aura-map__swatch-name">{snapshot.dominantColor.name}</span>
              <span className="aura-map__swatch-meaning">{snapshot.dominantColor.meaning}</span>
            </span>
          </li>
          <li className="aura-map__card">
            <span
              className="aura-map__orb"
              style={{ backgroundColor: outer.hex, color: outer.hex }}
            />
            <span>
              <span className="aura-map__card-kicker">Внешнее поле</span>
              <span className="aura-map__swatch-name">{outer.name}</span>
              <span className="aura-map__swatch-meaning">{outer.meaning}</span>
            </span>
          </li>
          <li className="aura-map__card">
            <span className="aura-map__orb aura-map__orb--ghost" />
            <span>
              <span className="aura-map__card-kicker">Чакры</span>
              <span className="aura-map__swatch-name">
                {veiled || !chakraCounts || chakras.length === 0
                  ? "В полном разборе"
                  : `${chakraCounts.balanced} в балансе`}
              </span>
              <span className="aura-map__swatch-meaning">
                {veiled || !chakraCounts || chakras.length === 0
                  ? "Семь центров откроются после разбора."
                  : [
                      chakraCounts.open ? `${chakraCounts.open} открыты` : null,
                      chakraCounts.blocked ? `${chakraCounts.blocked} требуют внимания` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Все в балансе."}
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div className="aura-map__details">
        <details className="aura-acc">
          <summary>Семь слоёв</summary>
          <ol className="aura-acc__list">
            {AURA_LAYER_KEYS.map((key, i) => {
              const found = snapshot.layers?.find((l) => l.key === key);
              const name = found?.name ?? AURA_LAYER_NAMES[key];
              const state = !veiled && found?.state ? found.state : LAYER_ROLE[key];
              return (
                <li key={key}>
                  <span
                    className="aura-map__orb aura-map__orb--sm"
                    style={{ backgroundColor: layers[i], color: layers[i] }}
                  />
                  <span>
                    <span className="aura-map__key-name">
                      <span className="aura-map__idx">{String(i + 1).padStart(2, "0")}</span>
                      {name}
                    </span>
                    <span className="aura-map__key-state">{state}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </details>

        <details className="aura-acc">
          <summary>Состояние чакр</summary>
          <ol className="aura-acc__list">
            {[...AURA_CHAKRA_KEYS].reverse().map((key) => {
              const found = chakras.find((c) => c.key === key);
              const name = found?.name ?? AURA_CHAKRA_NAMES[key];
              if (veiled) {
                return (
                  <li key={key}>
                    <span
                      className="aura-map__orb aura-map__orb--sm aura-map__key-dot--veiled"
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
                <li key={key}>
                  <span
                    className="aura-map__orb aura-map__orb--sm"
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
        </details>
      </div>
    </figure>
  );
}
