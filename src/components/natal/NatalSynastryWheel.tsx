"use client";

import { useId, useMemo, useState } from "react";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";

const SIGNS = [
  ["Овен", "♈"],
  ["Телец", "♉"],
  ["Близнецы", "♊"],
  ["Рак", "♋"],
  ["Лев", "♌"],
  ["Дева", "♍"],
  ["Весы", "♎"],
  ["Скорпион", "♏"],
  ["Стрелец", "♐"],
  ["Козерог", "♑"],
  ["Водолей", "♒"],
  ["Рыбы", "♓"],
] as const;

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
  id?: string;
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
  // Default true keeps legacy snapshots (pre-timeKnown payloads) unchanged.
  timeKnownA?: boolean;
  timeKnownB?: boolean;
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

function collectPlanets(western: Record<string, unknown>, timeKnown: boolean) {
  const list: Array<{ key: string; label: string; longitude: number }> = [];
  for (const p of PLANET_KEYS) {
    const body =
      p.key === "sun" || p.key === "moon"
        ? western[p.key]
        : (western.planets as Record<string, unknown> | undefined)?.[p.key];
    const longitude = longitudeOf(body);
    if (longitude != null) list.push({ key: p.key, label: p.label, longitude });
  }
  // Defense in depth: never paint a technical-noon ascendant for unknown time,
  // even if a stale payload still carries one.
  const rising = timeKnown ? longitudeOf(western.rising) : null;
  if (rising != null) list.push({ key: "rising", label: "ASC", longitude: rising });
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
  size = 340,
  timeKnownA = true,
  timeKnownB = true,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.47;
  const innerR = size * 0.22;
  const ringA = size * 0.30;
  const ringB = size * 0.41;
  const laneStep = size * 0.018;
  const ascA = timeKnownA ? longitudeOf(chartA.rising) : null;
  const longitudeRotation = ascA == null ? 0 : 270 - ascA;

  const planetsA = useMemo(
    () => layoutWheelBodies(collectPlanets(chartA, timeKnownA)),
    [chartA, timeKnownA],
  );
  const planetsB = useMemo(
    () => layoutWheelBodies(collectPlanets(chartB, timeKnownB)),
    [chartB, timeKnownB],
  );
  const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "supportive" | "challenging">("all");
  const aspectLines = useMemo(() => {
    const mapA = new Map(planetsA.map((p) => [p.key, p]));
    const mapB = new Map(planetsB.map((p) => [p.key, p]));
    return crossAspects.filter((aspect) => {
      if (filter === "supportive") return aspect.aspect === "trine" || aspect.aspect === "sextile";
      if (filter === "challenging") return aspect.aspect === "square" || aspect.aspect === "opposition";
      return true;
    }).slice(0, 16).flatMap((asp) => {
      const a = mapA.get(asp.bodyAKey);
      const b = mapB.get(asp.bodyBKey);
      if (!a || !b) return [];
      const p1 = polar(cx, cy, wheeledRadius(ringA, a.lane, laneStep), a.longitude + longitudeRotation);
      const p2 = polar(cx, cy, wheeledRadius(ringB, b.lane, laneStep), b.longitude + longitudeRotation);
      return [{ ...asp, p1, p2 }];
    });
  }, [crossAspects, planetsA, planetsB, cx, cy, ringA, ringB, laneStep, longitudeRotation, filter]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Какие аспекты показать">
        {([
          ["all", "Все"],
          ["supportive", "Поддерживающие"],
          ["challenging", "Напряжённые"],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
            className={`min-h-10 rounded-lg px-3 text-xs ${filter === value ? "bg-amber-300/15 text-amber-100" : "bg-white/[0.04] text-white/50"}`}>
            {label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-full max-w-[400px]"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Синастрическое колесо: {labelA} и {labelB}</title>
        <desc id={descriptionId}>
          Два кольца положений планет и асцендентов с шестнадцатью наиболее точными межкартными аспектами.
        </desc>
        <circle cx={cx} cy={cy} r={outerR + 3} fill="#0f0a1a" stroke="#fbbf2433" strokeWidth="1" />
        {SIGNS.map(([name, glyph], i) => {
          const lon = i * 30;
          const p1 = polar(cx, cy, innerR, lon + longitudeRotation);
          const p2 = polar(cx, cy, outerR, lon + longitudeRotation);
          const labelPoint = polar(cx, cy, size * 0.16, lon + 15 + longitudeRotation);
          return (
            <g key={name}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff18" strokeWidth="0.5" />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fde68a99"
                fontSize={size * 0.034}
                aria-label={name}
              >
                {glyph}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#34d39944" strokeWidth="1" strokeDasharray="4 3" />
        <circle cx={cx} cy={cy} r={(ringA + ringB) / 2} fill="none" stroke="#ffffff15" strokeWidth="0.5" />

        {aspectLines.map((line, idx) => {
          const id = line.id ?? `${line.bodyAKey}:${line.aspect}:${line.bodyBKey}`;
          const highlighted = selectedAspect === id ||
            selectedBody === `a:${line.bodyAKey}` || selectedBody === `b:${line.bodyBKey}`;
          return (
          <line
            key={`asp-${id}-${idx}`}
            tabIndex={0}
            role="button"
            aria-pressed={selectedAspect === id}
            aria-label={`${line.bodyAKey}, ${line.aspect}, ${line.bodyBKey}, орб ${line.orb ?? "не указан"}°`}
            onFocus={() => setSelectedAspect(id)}
            onBlur={() => setSelectedAspect(null)}
            onClick={() => setSelectedAspect((value) => value === id ? null : id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedAspect((value) => value === id ? null : id);
              }
            }}
            x1={line.p1.x}
            y1={line.p1.y}
            x2={line.p2.x}
            y2={line.p2.y}
            stroke={aspectStroke(line.aspect)}
            strokeWidth={highlighted ? "2.5" : "1"}
            opacity={selectedAspect || selectedBody ? (highlighted ? 1 : 0.2) : 1}
            className="cursor-pointer motion-reduce:transition-none"
          >
            <title>{line.bodyAKey} — {line.aspect} — {line.bodyBKey}, орб {line.orb ?? "—"}°</title>
          </line>
          );
        })}

        {planetsA.map((p) => {
          const { x, y } = polar(cx, cy, wheeledRadius(ringA, p.lane, laneStep), p.longitude + longitudeRotation);
          const meta = PLANET_KEYS.find((k) => k.key === p.key);
          const color = meta?.colorA ?? "#34d399";
          const glyphSize = p.label.length > 1 ? size * 0.028 : size * 0.036;
          return (
            <g key={`a-${p.key}`} tabIndex={0} role="button" aria-label={`${labelA}: ${p.key}, ${p.longitude.toFixed(1)}°`}
              aria-pressed={selectedBody === `a:${p.key}`}
              onFocus={() => setSelectedBody(`a:${p.key}`)} onBlur={() => setSelectedBody(null)}
              onClick={() => setSelectedBody((value) => value === `a:${p.key}` ? null : `a:${p.key}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedBody((value) => value === `a:${p.key}` ? null : `a:${p.key}`);
                }
              }}
              opacity={selectedBody && selectedBody !== `a:${p.key}` ? 0.35 : 1} className="cursor-pointer focus:outline-none">
              <title>{labelA}: {p.key}, {p.longitude.toFixed(1)}°</title>
              <circle cx={x} cy={y} r={size * 0.02} fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={glyphSize}>
                {p.label}
              </text>
            </g>
          );
        })}

        {planetsB.map((p) => {
          const { x, y } = polar(cx, cy, wheeledRadius(ringB, p.lane, laneStep), p.longitude + longitudeRotation);
          const meta = PLANET_KEYS.find((k) => k.key === p.key);
          const color = meta?.colorB ?? "#f472b6";
          const glyphSize = p.label.length > 1 ? size * 0.026 : size * 0.034;
          return (
            <g key={`b-${p.key}`} tabIndex={0} role="button" aria-label={`${labelB}: ${p.key}, ${p.longitude.toFixed(1)}°`}
              aria-pressed={selectedBody === `b:${p.key}`}
              onFocus={() => setSelectedBody(`b:${p.key}`)} onBlur={() => setSelectedBody(null)}
              onClick={() => setSelectedBody((value) => value === `b:${p.key}` ? null : `b:${p.key}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedBody((value) => value === `b:${p.key}` ? null : `b:${p.key}`);
                }
              }}
              opacity={selectedBody && selectedBody !== `b:${p.key}` ? 0.35 : 1} className="cursor-pointer focus:outline-none">
              <title>{labelB}: {p.key}, {p.longitude.toFixed(1)}°</title>
              <circle cx={x} cy={y} r={size * 0.019} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="0.8" />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={glyphSize}>
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
      <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/55">
        <summary className="cursor-pointer text-white/70">Текстовая версия синастрии</summary>
        <ul className="mt-2 space-y-1">
          {aspectLines.length ? aspectLines.map((line, index) => (
            <li key={`${line.id ?? index}-text`}>
              {line.bodyAKey} — {line.aspect} — {line.bodyBKey}; орб {line.orb ?? "—"}°
            </li>
          )) : <li>Аспекты по выбранному фильтру отсутствуют.</li>}
        </ul>
      </details>
    </div>
  );
}
