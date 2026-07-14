"use client";

import { useMemo } from "react";

const PLANET_KEYS: Array<{ key: string; label: string; colorA: string; colorB: string }> = [
  { key: "sun", label: "☉", colorA: "#fbbf24", colorB: "#f59e0b" },
  { key: "moon", label: "☽", colorA: "#e2e8f0", colorB: "#cbd5e1" },
  { key: "mercury", label: "☿", colorA: "#94a3b8", colorB: "#64748b" },
  { key: "venus", label: "♀", colorA: "#f472b6", colorB: "#ec4899" },
  { key: "mars", label: "♂", colorA: "#ef4444", colorB: "#dc2626" },
  { key: "jupiter", label: "♃", colorA: "#a78bfa", colorB: "#8b5cf6" },
  { key: "saturn", label: "♄", colorA: "#64748b", colorB: "#475569" },
];

type CrossAspect = {
  bodyAKey: string;
  bodyBKey: string;
  aspect: string;
  orb?: number;
};

type Props = {
  chartA: Record<string, unknown>;
  chartB: Record<string, unknown>;
  crossAspects?: CrossAspect[];
  labelA?: string;
  labelB?: string;
  size?: number;
};

function longitudeOf(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const lon = (body as { longitude?: number }).longitude;
  return typeof lon === "number" ? lon : null;
}

function polar(cx: number, cy: number, r: number, longitude: number) {
  const deg = 90 - longitude;
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function collectPlanets(western: Record<string, unknown>) {
  const list: Array<{ key: string; label: string; longitude: number }> = [];
  for (const p of PLANET_KEYS) {
    const body =
      p.key === "sun" || p.key === "moon"
        ? western[p.key]
        : (western.planets as Record<string, unknown> | undefined)?.[p.key];
    const longitude = longitudeOf(body);
    if (longitude != null) list.push({ key: p.key, label: p.label, longitude });
  }
  const rising = longitudeOf(western.rising);
  if (rising != null) list.push({ key: "asc", label: "ASC", longitude: rising });
  return list;
}

function aspectStroke(aspect: string): string {
  if (aspect === "trine" || aspect === "sextile") return "#34d39988";
  if (aspect === "square" || aspect === "opposition") return "#f8717188";
  return "#fbbf2488";
}

export default function NatalSynastryWheel({
  chartA,
  chartB,
  crossAspects = [],
  labelA = "A",
  labelB = "B",
  size = 300,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.3;
  const ringA = size * 0.34;
  const ringB = size * 0.42;
  const ascA = longitudeOf(chartA.rising);
  const longitudeRotation = ascA == null ? 0 : 270 - ascA;

  const planetsA = useMemo(() => collectPlanets(chartA), [chartA]);
  const planetsB = useMemo(() => collectPlanets(chartB), [chartB]);

  const aspectLines = useMemo(() => {
    const mapA = new Map(planetsA.map((p) => [p.key, p]));
    const mapB = new Map(planetsB.map((p) => [p.key, p]));
    return crossAspects.slice(0, 10).flatMap((asp) => {
      const a = mapA.get(asp.bodyAKey);
      const b = mapB.get(asp.bodyBKey);
      if (!a || !b) return [];
      const p1 = polar(cx, cy, ringA, a.longitude + longitudeRotation);
      const p2 = polar(cx, cy, ringB, b.longitude + longitudeRotation);
      return [{ ...asp, p1, p2 }];
    });
  }, [crossAspects, planetsA, planetsB, cx, cy, ringA, ringB, longitudeRotation]);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-full max-w-[340px]"
        role="img"
        aria-label={`Синастрическое колесо: ${labelA} и ${labelB}`}
      >
        <circle cx={cx} cy={cy} r={outerR + 3} fill="#0f0a1a" stroke="#fbbf2433" strokeWidth="1" />
        {Array.from({ length: 12 }).map((_, i) => {
          const lon = i * 30;
          const p1 = polar(cx, cy, innerR, lon + longitudeRotation);
          const p2 = polar(cx, cy, outerR, lon + longitudeRotation);
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff10" strokeWidth="0.5" />
          );
        })}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#34d39944" strokeWidth="1" strokeDasharray="4 3" />
        <circle cx={cx} cy={cy} r={(ringA + ringB) / 2} fill="none" stroke="#ffffff15" strokeWidth="0.5" />

        {aspectLines.map((line, idx) => (
          <line
            key={`asp-${idx}`}
            x1={line.p1.x}
            y1={line.p1.y}
            x2={line.p2.x}
            y2={line.p2.y}
            stroke={aspectStroke(line.aspect)}
            strokeWidth="1"
          />
        ))}

        {planetsA.map((p) => {
          const { x, y } = polar(cx, cy, ringA, p.longitude + longitudeRotation);
          const meta = PLANET_KEYS.find((k) => k.key === p.key);
          const color = meta?.colorA ?? "#34d399";
          return (
            <g key={`a-${p.key}`}>
              <circle cx={x} cy={y} r={size * 0.024} fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.04}>
                {p.label}
              </text>
            </g>
          );
        })}

        {planetsB.map((p) => {
          const { x, y } = polar(cx, cy, ringB, p.longitude + longitudeRotation);
          const meta = PLANET_KEYS.find((k) => k.key === p.key);
          const color = meta?.colorB ?? "#f472b6";
          return (
            <g key={`b-${p.key}`}>
              <circle cx={x} cy={y} r={size * 0.024} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="0.8" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.038}>
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-center gap-4 text-[11px] text-white/50">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/70" />
          {labelA} (внутреннее)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-pink-400/70" />
          {labelB} (внешнее)
        </span>
      </div>
    </div>
  );
}
