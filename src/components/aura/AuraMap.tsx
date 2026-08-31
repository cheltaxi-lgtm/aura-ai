"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  AURA_CHAKRA_KEYS,
  AURA_CHAKRA_NAMES,
  AURA_LAYER_KEYS,
  AURA_LAYER_NAMES,
  AURA_VERDICT_LABELS,
  type AuraChakraKey,
  type AuraChakraOpenness,
  type AuraSnapshot,
  type AuraTeaserSnapshot,
} from "@/lib/aura-constants";
import {
  AURA_CHAKRA_POS,
  AURA_FIELD_MASSES,
  AURA_LIGHT,
  AURA_PRESENCE_PATH,
  AURA_VIZ_VB,
} from "@/components/aura/aura-viz-geometry";

/**
 * Human-made-of-light field. Reads only the structured snapshot —
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

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Semantic hex → cinematic inner / mid / rim. Meaning stays the same hue. */
function cinematic(hex: string): { deep: string; mid: string; rim: string } {
  const lum = luminance(hex);
  const [r, g, b] = hexToRgb(hex);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma < 28) {
    return {
      deep: mixHex(hex, "#16141c", 0.42),
      mid: mixHex(hex, "#d9d3cb", 0.38),
      rim: mixHex(hex, "#f3ece4", 0.5),
    };
  }
  const lift = lum < 0.34 ? mixHex(hex, "#d8d2c6", 0.28) : hex;
  return {
    deep: mixHex(hex, "#0c1020", 0.48),
    mid: lift,
    rim: mixHex(lift, "#f4f1ea", lum > 0.78 ? 0.12 : 0.32),
  };
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

function chakraScale(openness: AuraChakraOpenness, veiled: boolean) {
  if (veiled) return { halo: 16, nucleus: 1.8, haloOp: 0.05, nucOp: 0.28 };
  if (openness === "blocked") return { halo: 22, nucleus: 1.6, haloOp: 0.045, nucOp: 0.28 };
  if (openness === "open") return { halo: 20, nucleus: 2.5, haloOp: 0.09, nucOp: 0.62 };
  return { halo: 18, nucleus: 2.1, haloOp: 0.07, nucOp: 0.48 };
}

export default function AuraMap({ snapshot, veiled = false }: AuraMapProps) {
  const uid = useId().replace(/:/g, "");
  const chakras = snapshot.chakras ?? [];
  const outer = snapshot.secondaryColors[0] ?? snapshot.dominantColor;
  const coreLook = useMemo(() => cinematic(snapshot.dominantColor.hex), [snapshot.dominantColor.hex]);
  const outerLook = useMemo(() => cinematic(outer.hex), [outer.hex]);
  const copy = headlineOf(snapshot);
  const [explore, setExplore] = useState(false);
  const [focusLayer, setFocusLayer] = useState<number | null>(null);
  const [focusChakra, setFocusChakra] = useState<AuraChakraKey | null>(null);
  const [locked, setLocked] = useState(false);
  const fineHover = useFineHover();

  const layerColors = useMemo(() => {
    const c1 = snapshot.dominantColor.hex;
    const c2 = snapshot.secondaryColors[0]?.hex ?? c1;
    const c3 = snapshot.secondaryColors[1]?.hex ?? c2;
    return AURA_FIELD_MASSES.map((_, i) => {
      const t = i / 6;
      if (t <= 0.5) return mixHex(c1, c2, t * 2);
      return mixHex(c2, c3, (t - 0.5) * 2);
    });
  }, [snapshot.dominantColor.hex, snapshot.secondaryColors]);

  const focusedChakra = focusChakra
    ? chakras.find((c) => c.key === focusChakra) ?? null
    : null;
  const focusedLayerKey = focusLayer !== null ? AURA_LAYER_KEYS[focusLayer] : null;
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
    if (explore) {
      setFocusLayer(null);
      setLocked(false);
    }
    if (focusChakra === key && locked) {
      setFocusChakra(null);
      setLocked(false);
      return;
    }
    setFocusChakra(key);
    setLocked(true);
  }

  function hoverChakra(key: AuraChakraKey | null) {
    if (!fineHover || locked) return;
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
        {copy.sub ? <p className="aura-map__lead">{copy.sub}</p> : null}
      </header>

      <div className="aura-map__scene">
        <svg
          viewBox={`0 0 ${AURA_VIZ_VB.w} ${AURA_VIZ_VB.h}`}
          className="aura-viz__svg"
          role="img"
          aria-labelledby={`${uid}-title`}
        >
          <title id={`${uid}-title`}>
            {veiled
              ? "Световое присутствие и поле вокруг него: цвет ядра и внешнего слоя. Состояния чакр — в полном разборе."
              : "Световая человеческая фигура и органическое поле ауры."}
          </title>
          <defs>
            <filter
              id={`${uid}-soft`}
              x="-28%"
              y="-28%"
              width="156%"
              height="156%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="10" />
            </filter>
            <filter
              id={`${uid}-haze`}
              x="-36%"
              y="-36%"
              width="172%"
              height="172%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="18" />
            </filter>
            <filter
              id={`${uid}-bloom`}
              x="-70%"
              y="-70%"
              width="240%"
              height="240%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter
              id={`${uid}-mask-soft`}
              x="-8%"
              y="-6%"
              width="116%"
              height="118%"
              filterUnits="objectBoundingBox"
            >
              <feGaussianBlur stdDeviation="8" />
            </filter>
            <linearGradient id={`${uid}-mask-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.96" />
              <stop offset="58%" stopColor="#fff" stopOpacity="0.78" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask
              id={`${uid}-presence`}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={AURA_VIZ_VB.w}
              height={AURA_VIZ_VB.h}
            >
              <rect width={AURA_VIZ_VB.w} height={AURA_VIZ_VB.h} fill="#000" />
              <path
                d={AURA_PRESENCE_PATH}
                fill={`url(#${uid}-mask-fade)`}
                filter={`url(#${uid}-mask-soft)`}
              />
            </mask>
            <linearGradient id={`${uid}-column`} x1="0.42" y1="0.08" x2="0.58" y2="1">
              <stop offset="0%" stopColor={mixHex(coreLook.rim, "#f7f3ea", 0.18)} stopOpacity="0.38" />
              <stop offset="26%" stopColor={coreLook.mid} stopOpacity="0.72" />
              <stop offset="58%" stopColor={coreLook.deep} stopOpacity="0.28" />
              <stop offset="100%" stopColor={coreLook.deep} stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${uid}-core`} cx="48%" cy="38%" r="62%">
              <stop offset="0%" stopColor={coreLook.rim} stopOpacity="0.95" />
              <stop offset="34%" stopColor={coreLook.mid} stopOpacity="0.72" />
              <stop offset="100%" stopColor={coreLook.deep} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-head`} cx="42%" cy="28%" r="70%">
              <stop offset="0%" stopColor={mixHex(coreLook.rim, "#f7f3ea", 0.4)} stopOpacity="0.7" />
              <stop offset="55%" stopColor={coreLook.mid} stopOpacity="0.28" />
              <stop offset="100%" stopColor={coreLook.deep} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-outer`} cx="42%" cy="34%" r="78%">
              <stop offset="0%" stopColor={outerLook.mid} stopOpacity="0.4" />
              <stop offset="52%" stopColor={outerLook.rim} stopOpacity="0.16" />
              <stop offset="100%" stopColor={outerLook.deep} stopOpacity="0" />
            </radialGradient>
            {layerColors.map((color, i) => {
              const look = cinematic(color);
              return (
                <radialGradient key={i} id={`${uid}-m-${i}`} cx={`${40 + (i % 3) * 8}%`} cy={`${32 + i * 4}%`} r="72%">
                  <stop offset="0%" stopColor={look.mid} stopOpacity={0.36 - i * 0.028} />
                  <stop offset="68%" stopColor={look.rim} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={look.deep} stopOpacity="0" />
                </radialGradient>
              );
            })}
          </defs>

          <g className="aura-viz__field" aria-hidden>
            {AURA_FIELD_MASSES.map((mass, i) => {
              const isolated = explore && focusLayer !== null;
              const dimmed = isolated && focusLayer !== i;
              const hot = isolated && focusLayer === i;
              const isOuter = i >= 5;
              return (
                <path
                  key={mass.key}
                  className={`aura-viz__mass${dimmed ? " is-dim" : ""}${hot ? " is-hot" : ""}`}
                  d={mass.d}
                  fill={isOuter ? `url(#${uid}-outer)` : `url(#${uid}-m-${i})`}
                  filter={`url(#${uid}-${isOuter ? "haze" : "soft"})`}
                  style={{ animationDelay: `${i * 1.4}s` }}
                />
              );
            })}
          </g>

          <g className="aura-viz__presence" aria-hidden mask={`url(#${uid}-presence)`}>
            <rect
              width={AURA_VIZ_VB.w}
              height={AURA_VIZ_VB.h}
              fill={`url(#${uid}-column)`}
            />
            <ellipse
              className="aura-viz__breath"
              cx={AURA_LIGHT.chest.cx}
              cy={AURA_LIGHT.chest.cy}
              rx={AURA_LIGHT.chest.rx}
              ry={AURA_LIGHT.chest.ry}
              fill={`url(#${uid}-core)`}
            />
            <ellipse
              className="aura-viz__breath"
              cx={AURA_LIGHT.head.cx}
              cy={AURA_LIGHT.head.cy}
              rx={AURA_LIGHT.head.rx}
              ry={AURA_LIGHT.head.ry}
              fill={`url(#${uid}-head)`}
            />
          </g>

          {(veiled ? AURA_CHAKRA_KEYS : chakras.map((c) => c.key)).map((key) => {
            const pos = AURA_CHAKRA_POS[key];
            const found = chakras.find((c) => c.key === key);
            const color = veiled ? VEILED_DOT : found?.color ?? VEILED_DOT;
            const openness = found?.openness ?? "balanced";
            const scale = chakraScale(openness, veiled);
            const label = found?.name ?? AURA_CHAKRA_NAMES[key];
            const hint = veiled
              ? "состояние откроется в полном разборе"
              : `${OPENNESS_RU[openness]}${found?.note ? ` — ${found.note}` : ""}`;
            return (
              <g key={key} className="aura-viz__chakra">
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={scale.halo}
                  fill={color}
                  fillOpacity={scale.haloOp}
                  filter={`url(#${uid}-bloom)`}
                  pointerEvents="none"
                />
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={scale.nucleus}
                  fill={mixHex(color, "#fff6e8", 0.28)}
                  fillOpacity={scale.nucOp}
                  pointerEvents="none"
                />
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={22}
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
              </g>
            );
          })}
        </svg>

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

        {explore && focusLayer !== null && focusedLayerKey ? (
          <div className="aura-viz__tip" role="status">
            <p className="aura-viz__tip-kicker">
              Слой {String(focusLayer + 1).padStart(2, "0")}
            </p>
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
      </ul>

      <div className="aura-map__details">
        <button
          type="button"
          className="aura-map__explore"
          aria-expanded={explore}
          onClick={() => {
            setExplore((v) => !v);
            setFocusLayer(null);
            setLocked(false);
          }}
        >
          {explore ? "Скрыть слои ауры" : "Исследовать слои ауры"}
        </button>

        {explore ? (
          <ol className="aura-map__layer-nav">
            {AURA_LAYER_KEYS.map((key, i) => {
              const found = snapshot.layers?.find((l) => l.key === key);
              const name = found?.name ?? AURA_LAYER_NAMES[key];
              const state = !veiled && found?.state ? found.state : LAYER_ROLE[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`aura-map__layer-btn${focusLayer === i ? " is-on" : ""}`}
                    aria-pressed={focusLayer === i}
                    onClick={() => toggleLayer(i)}
                  >
                    <span
                      className="aura-map__orb aura-map__orb--sm"
                      style={{ backgroundColor: layerColors[i], color: layerColors[i] }}
                    />
                    <span>
                      <span className="aura-map__key-name">
                        <span className="aura-map__idx">{String(i + 1).padStart(2, "0")}</span>
                        {name}
                      </span>
                      <span className="aura-map__key-state">{state}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}

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
                    style={{ backgroundColor: layerColors[i], color: layerColors[i] }}
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
