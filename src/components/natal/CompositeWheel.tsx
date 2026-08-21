"use client";

import { useId, useMemo, useState } from "react";
import type { CompositeChart } from "@/lib/natal/composite";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";

const GLYPHS: Record<string, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃",
  saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇", chiron: "⚷", northNode: "☊",
};
const SIGNS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function polar(size: number, radius: number, longitude: number) {
  const radians = (90 - longitude) * Math.PI / 180;
  return { x: size / 2 + radius * Math.cos(radians), y: size / 2 - radius * Math.sin(radians) };
}

export default function CompositeWheel({ composite, size = 340 }: { composite: CompositeChart; size?: number }) {
  const titleId = useId();
  const descriptionId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const planetBase = size * 0.33;
  const laneStep = size * 0.026;
  const zodiacInner = size * 0.40;
  const zodiacOuter = size * 0.47;
  const bodies = useMemo(() => layoutWheelBodies(composite.bodies, 12), [composite.bodies]);
  const bodyByKey = useMemo(() => new Map(bodies.map((body) => [body.key, body])), [bodies]);

  return <div className="space-y-3">
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[400px]"
      role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>Композитное колесо отношений</title>
      <desc id={descriptionId}>Круговые мидпойнты общих планет и аспекты между ними. Дома и углы исключены.</desc>
      <circle cx={size / 2} cy={size / 2} r={zodiacOuter} fill="#0f0a1a" stroke="#fbbf2433" />
      {SIGNS.map((glyph, index) => {
        const inner = polar(size, zodiacInner, index * 30);
        const edge = polar(size, zodiacOuter, index * 30);
        const label = polar(size, size * 0.435, index * 30 + 15);
        return <g key={glyph}>
          <line x1={inner.x} y1={inner.y} x2={edge.x} y2={edge.y} stroke="#ffffff18" strokeWidth="0.5" />
          <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#fde68a99" fontSize={size * 0.034}>{glyph}</text>
        </g>;
      })}
      {composite.aspects.slice(0, 16).map((aspect) => {
        const first = bodyByKey.get(aspect.firstKey);
        const second = bodyByKey.get(aspect.secondKey);
        if (!first || !second) return null;
        const a = polar(size, wheeledRadius(planetBase, first.lane, laneStep), first.longitude);
        const b = polar(size, wheeledRadius(planetBase, second.lane, laneStep), second.longitude);
        const selectionKey = `aspect:${aspect.id}`;
        const active = selected === selectionKey;
        return <line key={aspect.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} tabIndex={0}
          role="button" aria-pressed={active} aria-label={`${aspect.firstKey} ${aspect.aspect} ${aspect.secondKey}, орб ${aspect.orb}°`}
          onFocus={() => setSelected(selectionKey)} onBlur={() => setSelected(null)}
          onClick={() => setSelected(active ? null : selectionKey)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelected((value) => value === selectionKey ? null : selectionKey);
            }
          }}
          stroke={aspect.aspect === "trine" || aspect.aspect === "sextile" ? "#34d39988" : "#f8717188"}
          strokeWidth={active ? 2.5 : 1} className="cursor-pointer motion-reduce:transition-none">
          <title>{aspect.firstKey} — {aspect.aspect} — {aspect.secondKey}; орб {aspect.orb}°</title>
        </line>;
      })}
      {bodies.map((body) => {
        const point = polar(size, wheeledRadius(planetBase, body.lane, laneStep), body.longitude);
        const selectionKey = `body:${body.key}`;
        const active = selected === selectionKey;
        return <g key={body.key} tabIndex={0} role="button" aria-pressed={active}
          aria-label={`${body.key}: ${body.sign} ${body.degree.toFixed(1)}°`}
          onFocus={() => setSelected(selectionKey)} onBlur={() => setSelected(null)}
          onClick={() => setSelected(active ? null : selectionKey)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelected((value) => value === selectionKey ? null : selectionKey);
            }
          }}
          className="cursor-pointer focus:outline-none" opacity={selected && !active ? .35 : 1}>
          <circle cx={point.x} cy={point.y} r={size * 0.019} fill="#fbbf2430" stroke="#fbbf24" />
          <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill="#fde68a" fontSize={size * 0.034}>
            {GLYPHS[body.key] ?? body.key.slice(0, 1)}
          </text><title>{body.key}: {body.sign} {body.degree.toFixed(1)}°</title>
        </g>;
      })}
    </svg>
    <p className="text-xs leading-5 text-amber-100/55">{composite.limitation}</p>
    <details className="rounded-lg border border-white/10 p-3 text-xs text-white/55">
      <summary className="cursor-pointer">Текстовая версия композита</summary>
      <ul className="mt-2 space-y-1">{composite.bodies.map((body) =>
        <li key={body.key}>{body.key}: {body.sign} {body.degree.toFixed(1)}°</li>)}</ul>
    </details>
  </div>;
}
