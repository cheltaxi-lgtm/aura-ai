"use client";

import { useId, useMemo, useState } from "react";
import { ASPECT_NAMES, BODY_NAMES } from "@/lib/natal/presentation";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";
import CompatibilityWheelCard from "./CompatibilityWheelCard";
import WheelZodiacBand, { wheelPolar } from "./WheelZodiacBand";

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

function collectPlanets(western: Record<string, unknown>, timeKnown: boolean) {
  const list: Array<{ key: string; label: string; longitude: number }> = [];
  for (const planet of PLANET_KEYS) {
    const body =
      planet.key === "sun" || planet.key === "moon"
        ? western[planet.key]
        : (western.planets as Record<string, unknown> | undefined)?.[planet.key];
    const longitude = longitudeOf(body);
    if (longitude != null) list.push({ key: planet.key, label: planet.label, longitude });
  }
  const rising = timeKnown ? longitudeOf(western.rising) : null;
  if (rising != null) list.push({ key: "rising", label: "ASC", longitude: rising });
  return list;
}

function aspectStroke(aspect: string): string {
  if (aspect === "trine" || aspect === "sextile") return "#34d399";
  if (aspect === "square" || aspect === "opposition") return "#f87171";
  return "#fbbf24";
}

function keyboardSelect(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export default function NatalSynastryWheel({
  chartA,
  chartB,
  crossAspects = [],
  labelA = "A",
  labelB = "B",
  size = 480,
  timeKnownA = true,
  timeKnownB = true,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const gradientId = useId().replace(/:/g, "");
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.475;
  const zodiacR = size * 0.395;
  const ringB = size * 0.345;
  const ringA = size * 0.285;
  const aspectR = size * 0.205;
  const laneStep = size * 0.018;
  const ascA = timeKnownA ? longitudeOf(chartA.rising) : null;
  const longitudeRotation = ascA == null ? 0 : 270 - ascA;

  const planetsA = useMemo(
    () => layoutWheelBodies(collectPlanets(chartA, timeKnownA), 15),
    [chartA, timeKnownA],
  );
  const planetsB = useMemo(
    () => layoutWheelBodies(collectPlanets(chartB, timeKnownB), 15),
    [chartB, timeKnownB],
  );
  const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "supportive" | "challenging">("all");
  const aspectLines = useMemo(() => {
    const mapA = new Map(planetsA.map((planet) => [planet.key, planet]));
    const mapB = new Map(planetsB.map((planet) => [planet.key, planet]));
    return crossAspects
      .filter((aspect) => {
        if (filter === "supportive") return aspect.aspect === "trine" || aspect.aspect === "sextile";
        if (filter === "challenging") return aspect.aspect === "square" || aspect.aspect === "opposition";
        return true;
      })
      .slice()
      .sort((left, right) => (left.orb ?? 99) - (right.orb ?? 99))
      .slice(0, 12)
      .flatMap((aspect) => {
        const a = mapA.get(aspect.bodyAKey);
        const b = mapB.get(aspect.bodyBKey);
        if (!a || !b) return [];
        const p1 = wheelPolar(cx, cy, aspectR, a.longitude + longitudeRotation);
        const p2 = wheelPolar(cx, cy, aspectR, b.longitude + longitudeRotation);
        return [{ ...aspect, p1, p2 }];
      });
  }, [crossAspects, planetsA, planetsB, cx, cy, aspectR, longitudeRotation, filter]);

  const renderBody = (
    planet: (typeof planetsA)[number],
    ring: "a" | "b",
    baseRadius: number,
  ) => {
    const meta = PLANET_KEYS.find((item) => item.key === planet.key);
    const color = ring === "a"
      ? (planet.key === "rising" ? "#34d399" : meta?.colorA ?? "#34d399")
      : (planet.key === "rising" ? "#f472b6" : meta?.colorB ?? "#f472b6");
    const id = `${ring}:${planet.key}`;
    const radius = wheeledRadius(baseRadius, planet.lane, laneStep);
    const point = wheelPolar(cx, cy, radius, planet.displayLongitude + longitudeRotation);
    const tick = wheelPolar(cx, cy, zodiacR, planet.longitude + longitudeRotation);
    const selected = selectedBody === id;
    const glyphSize = planet.label.length > 1 ? size * 0.022 : size * 0.034;
    const owner = ring === "a" ? labelA : labelB;
    return (
      <g
        key={id}
        tabIndex={0}
        role="button"
        aria-label={`${owner}: ${BODY_NAMES[planet.key] ?? planet.key}, ${planet.longitude.toFixed(1)}°`}
        aria-pressed={selected}
        onFocus={() => setSelectedBody(id)}
        onBlur={() => setSelectedBody(null)}
        onClick={() => setSelectedBody((value) => value === id ? null : id)}
        onKeyDown={(event) => keyboardSelect(event, () => setSelectedBody((value) => value === id ? null : id))}
        opacity={selectedBody && !selected ? 0.32 : 1}
        className="cursor-pointer focus:outline-none"
      >
        <title>{owner}: {BODY_NAMES[planet.key] ?? planet.key}, {planet.longitude.toFixed(1)}°</title>
        <line x1={tick.x} y1={tick.y} x2={point.x} y2={point.y} stroke={color} strokeOpacity="0.45" />
        <circle cx={point.x} cy={point.y} r={size * (selected ? 0.026 : 0.022)} fill="#100a1d" stroke={color} strokeWidth={selected ? 2 : 1.3} />
        <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={glyphSize} fontWeight="600">
          {planet.label}
        </text>
      </g>
    );
  };

  return (
    <CompatibilityWheelCard
      title="Синастрия"
      toolbar={(
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Какие аспекты показать">
          {([
            ["all", "Все"],
            ["supportive", "Поддерживающие"],
            ["challenging", "Напряжённые"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`min-h-10 rounded-full border px-3 text-xs ${filter === value ? "border-amber-300/40 bg-amber-300/15 text-amber-100" : "border-white/10 text-white/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      footer={(
        <>
          <div className="flex min-h-10 flex-wrap items-center justify-center gap-4 text-[11px] text-white/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/70" />
              {labelA} · внутри
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-pink-400/70" />
              {labelB} · снаружи
            </span>
          </div>
          <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/55">
            <summary className="cursor-pointer text-white/70">Текстовая версия синастрии</summary>
            <ul className="mt-2 space-y-1">
              {aspectLines.length ? aspectLines.map((line, index) => (
                <li key={`${line.id ?? index}-text`}>
                  {BODY_NAMES[line.bodyAKey] ?? line.bodyAKey} — {ASPECT_NAMES[line.aspect] ?? line.aspect} — {BODY_NAMES[line.bodyBKey] ?? line.bodyBKey}; орб {line.orb ?? "—"}°
                </li>
              )) : <li>Аспекты по выбранному фильтру отсутствуют.</li>}
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
        <title id={titleId}>Синастрическое колесо: {labelA} и {labelB}</title>
        <desc id={descriptionId}>
          Два кольца положений планет и асцендентов с наиболее точными межкартными аспектами.
        </desc>
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0b0713" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={outerR + 4} fill={`url(#${gradientId})`} stroke="#fbbf2440" />
        <WheelZodiacBand cx={cx} cy={cy} size={size} innerR={zodiacR} outerR={outerR} rotation={longitudeRotation} />
        <circle cx={cx} cy={cy} r={zodiacR} fill="none" stroke="#fbbf2455" />
        <circle cx={cx} cy={cy} r={ringB} fill="none" stroke="#f472b622" />
        <circle cx={cx} cy={cy} r={ringA} fill="none" stroke="#34d39922" />
        <circle cx={cx} cy={cy} r={aspectR} fill="#08050e" fillOpacity=".35" stroke="#ffffff18" />

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
              aria-label={`${BODY_NAMES[line.bodyAKey] ?? line.bodyAKey}, ${ASPECT_NAMES[line.aspect] ?? line.aspect}, ${BODY_NAMES[line.bodyBKey] ?? line.bodyBKey}, орб ${line.orb ?? "не указан"}°`}
              onFocus={() => setSelectedAspect(id)}
              onBlur={() => setSelectedAspect(null)}
              onClick={() => setSelectedAspect((value) => value === id ? null : id)}
              onKeyDown={(event) => keyboardSelect(event, () => setSelectedAspect((value) => value === id ? null : id))}
              x1={line.p1.x}
              y1={line.p1.y}
              x2={line.p2.x}
              y2={line.p2.y}
              stroke={aspectStroke(line.aspect)}
              strokeWidth={highlighted ? 2.6 : 1.15}
              opacity={selectedAspect || selectedBody ? (highlighted ? 1 : 0.12) : 0.38}
              className="cursor-pointer motion-reduce:transition-none"
            >
              <title>{BODY_NAMES[line.bodyAKey] ?? line.bodyAKey} — {ASPECT_NAMES[line.aspect] ?? line.aspect} — {BODY_NAMES[line.bodyBKey] ?? line.bodyBKey}, орб {line.orb ?? "—"}°</title>
            </line>
          );
        })}

        {planetsA.map((planet) => renderBody(planet, "a", ringA))}
        {planetsB.map((planet) => renderBody(planet, "b", ringB))}
      </svg>
    </CompatibilityWheelCard>
  );
}
