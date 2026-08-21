"use client";

import { useId, useMemo, useState } from "react";
import type { CompositeChart } from "@/lib/natal/composite";
import { ASPECT_NAMES, BODY_NAMES } from "@/lib/natal/presentation";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";
import CompatibilityWheelCard from "./CompatibilityWheelCard";
import WheelZodiacBand, { wheelPolar } from "./WheelZodiacBand";

const GLYPHS: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃",
  saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇", chiron: "⚷", northNode: "☊",
};

const EXTRA_NAMES: Record<string, string> = { chiron: "Хирон", northNode: "Северный узел" };

function bodyLabel(key: string) {
  return BODY_NAMES[key] ?? EXTRA_NAMES[key] ?? key;
}

const BODY_COLORS: Record<string, string> = {
  sun: "#fbbf24", moon: "#e2e8f0", mercury: "#94a3b8", venus: "#f472b6",
  mars: "#ef4444", jupiter: "#a78bfa", saturn: "#94a3b8", uranus: "#22d3ee",
  neptune: "#818cf8", pluto: "#c084fc", chiron: "#fb923c", northNode: "#fde68a",
};

function keyboardSelect(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export default function CompositeWheel({ composite, size = 480 }: { composite: CompositeChart; size?: number }) {
  const titleId = useId();
  const descriptionId = useId();
  const gradientId = useId().replace(/:/g, "");
  const [selected, setSelected] = useState<string | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.475;
  const zodiacR = size * 0.395;
  const planetBase = size * 0.31;
  const aspectR = size * 0.205;
  const laneStep = size * 0.022;
  const bodies = useMemo(() => layoutWheelBodies(composite.bodies, 17), [composite.bodies]);
  const bodyByKey = useMemo(() => new Map(bodies.map((body) => [body.key, body])), [bodies]);

  return (
    <CompatibilityWheelCard
      title="Композит"
      toolbar={(
        <p className="min-h-10 max-w-sm px-2 text-center text-[11px] leading-5 text-white/40">
          Мидпойнты планет · дома и углы в этой методике не считаются
        </p>
      )}
      footer={(
        <>
          <p className="line-clamp-2 min-h-10 text-center text-[11px] leading-5 text-amber-100/45" title={composite.limitation}>
            {composite.limitation}
          </p>
          <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">
            <summary className="cursor-pointer text-white/70">Текстовая версия композита</summary>
            <ul className="mt-2 space-y-1">
              {composite.bodies.map((body) => (
                <li key={body.key}>{bodyLabel(body.key)}: {body.sign} {body.degree.toFixed(1)}°</li>
              ))}
            </ul>
          </details>
        </>
      )}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto h-auto w-full max-w-[520px]"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Композитное колесо отношений</title>
        <desc id={descriptionId}>Круговые мидпойнты общих планет и аспекты между ними. Дома и углы исключены.</desc>
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0b0713" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={outerR + 4} fill={`url(#${gradientId})`} stroke="#fbbf2440" />
        <WheelZodiacBand cx={cx} cy={cy} size={size} innerR={zodiacR} outerR={outerR} />
        <circle cx={cx} cy={cy} r={zodiacR} fill="none" stroke="#fbbf2455" />
        <circle cx={cx} cy={cy} r={aspectR} fill="#08050e" fillOpacity=".35" stroke="#ffffff18" />
        {composite.aspects
          .slice()
          .sort((left, right) => left.orb - right.orb)
          .slice(0, 12)
          .map((aspect) => {
            const first = bodyByKey.get(aspect.firstKey);
            const second = bodyByKey.get(aspect.secondKey);
            if (!first || !second) return null;
            const a = wheelPolar(cx, cy, aspectR, first.longitude);
            const b = wheelPolar(cx, cy, aspectR, second.longitude);
            const selectionKey = `aspect:${aspect.id}`;
            const active = selected === selectionKey;
            const bodyActive = selected === `body:${aspect.firstKey}` || selected === `body:${aspect.secondKey}`;
            return (
              <line
                key={aspect.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                aria-label={`${bodyLabel(aspect.firstKey)} ${ASPECT_NAMES[aspect.aspect] ?? aspect.aspect} ${bodyLabel(aspect.secondKey)}, орб ${aspect.orb}°`}
                onFocus={() => setSelected(selectionKey)}
                onBlur={() => setSelected(null)}
                onClick={() => setSelected(active ? null : selectionKey)}
                onKeyDown={(event) => keyboardSelect(event, () => setSelected(active ? null : selectionKey))}
                stroke={aspect.aspect === "trine" || aspect.aspect === "sextile" ? "#34d399" : "#f87171"}
                strokeWidth={active || bodyActive ? 2.6 : 1.15}
                opacity={selected ? (active || bodyActive ? 1 : 0.12) : 0.38}
                className="cursor-pointer motion-reduce:transition-none"
              >
                <title>{bodyLabel(aspect.firstKey)} — {ASPECT_NAMES[aspect.aspect] ?? aspect.aspect} — {bodyLabel(aspect.secondKey)}; орб {aspect.orb}°</title>
              </line>
            );
          })}
        {bodies.map((body) => {
          const point = wheelPolar(cx, cy, wheeledRadius(planetBase, body.lane, laneStep), body.displayLongitude);
          const tick = wheelPolar(cx, cy, zodiacR, body.longitude);
          const selectionKey = `body:${body.key}`;
          const active = selected === selectionKey;
          const color = BODY_COLORS[body.key] ?? "#fde68a";
          return (
            <g
              key={body.key}
              tabIndex={0}
              role="button"
              aria-pressed={active}
              aria-label={`${bodyLabel(body.key)}: ${body.sign} ${body.degree.toFixed(1)}°`}
              onFocus={() => setSelected(selectionKey)}
              onBlur={() => setSelected(null)}
              onClick={() => setSelected(active ? null : selectionKey)}
              onKeyDown={(event) => keyboardSelect(event, () => setSelected(active ? null : selectionKey))}
              className="cursor-pointer focus:outline-none"
              opacity={selected && !active ? 0.32 : 1}
            >
              <line x1={tick.x} y1={tick.y} x2={point.x} y2={point.y} stroke={color} strokeOpacity="0.45" />
              <circle cx={point.x} cy={point.y} r={size * (active ? 0.026 : 0.022)} fill="#100a1d" stroke={color} strokeWidth={active ? 2 : 1.3} />
              <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.034} fontWeight="600">
                {GLYPHS[body.key] ?? body.key.slice(0, 1)}
              </text>
              <title>{bodyLabel(body.key)}: {body.sign} {body.degree.toFixed(1)}°</title>
            </g>
          );
        })}
      </svg>
    </CompatibilityWheelCard>
  );
}
