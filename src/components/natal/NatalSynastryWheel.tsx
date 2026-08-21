"use client";

import { useId, useMemo, useState } from "react";
import { signFromLongitude } from "@/lib/natal/math";
import { ASPECT_NAMES, BODY_NAMES, SIGN_RU } from "@/lib/natal/presentation";
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

function positionCaption(longitude: number) {
  const sign = signFromLongitude(longitude);
  return `${SIGN_RU[sign.name] ?? sign.name} ${sign.degree.toFixed(1)}°`;
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
  const zodiacR = size * 0.40;
  const ringB = size * 0.348;
  const ringA = size * 0.268;
  const aspectR = size * 0.20;
  const laneStep = size * 0.014;

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

  const glyphPoint = (planet: (typeof planetsA)[number], ring: "a" | "b") => {
    const base = ring === "a" ? ringA : ringB;
    const radius = wheeledRadius(base, planet.lane, laneStep, ring === "b" ? 1 : -1);
    return wheelPolar(cx, cy, radius, planet.displayLongitude);
  };

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
      .slice(0, 16)
      .flatMap((aspect) => {
        const a = mapA.get(aspect.bodyAKey);
        const b = mapB.get(aspect.bodyBKey);
        if (!a || !b) return [];
        return [{ ...aspect, p1: glyphPoint(a, "a"), p2: glyphPoint(b, "b") }];
      });
  }, [crossAspects, planetsA, planetsB, cx, cy, ringA, ringB, laneStep, filter]);

  const selectedPlanet = selectedBody
    ? (selectedBody.startsWith("a:")
      ? planetsA.find((planet) => `a:${planet.key}` === selectedBody)
      : planetsB.find((planet) => `b:${planet.key}` === selectedBody))
    : null;
  const selectedLine = selectedAspect
    ? aspectLines.find((line) => (line.id ?? `${line.bodyAKey}:${line.aspect}:${line.bodyBKey}`) === selectedAspect)
    : null;
  const status = selectedLine
    ? <>
      <p className="text-[10px] uppercase tracking-[0.16em] text-amber-200/50">Аспект</p>
      <p className="mt-1 text-sm text-white">
        {labelA}: {BODY_NAMES[selectedLine.bodyAKey] ?? selectedLine.bodyAKey}
        {" — "}
        {ASPECT_NAMES[selectedLine.aspect] ?? selectedLine.aspect}
        {" — "}
        {labelB}: {BODY_NAMES[selectedLine.bodyBKey] ?? selectedLine.bodyBKey}
      </p>
      <p className="mt-0.5 text-[11px] text-white/50">орб {selectedLine.orb ?? "—"}°</p>
    </>
    : selectedPlanet && selectedBody
      ? <>
        <p className="text-[10px] uppercase tracking-[0.16em] text-amber-200/50">
          {selectedBody.startsWith("a:") ? labelA : labelB}
        </p>
        <p className="mt-1 text-sm text-white">{BODY_NAMES[selectedPlanet.key] ?? selectedPlanet.key}</p>
        <p className="mt-0.5 text-[11px] text-white/50">{positionCaption(selectedPlanet.longitude)}</p>
      </>
      : <p className="text-xs leading-5 text-white/45">Нажмите планету или линию — здесь будет знак, градус и орб.</p>;

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
    const point = glyphPoint(planet, ring);
    const tickRail = ring === "b" ? zodiacR : baseRadius;
    const tick = wheelPolar(cx, cy, tickRail, planet.longitude);
    const selected = selectedBody === id;
    const glyphSize = planet.label.length > 1 ? size * 0.022 : size * 0.034;
    const owner = ring === "a" ? labelA : labelB;
    return (
      <g
        key={id}
        tabIndex={0}
        role="button"
        aria-label={`${owner}: ${BODY_NAMES[planet.key] ?? planet.key}, ${positionCaption(planet.longitude)}`}
        aria-pressed={selected}
        onFocus={() => { setSelectedAspect(null); setSelectedBody(id); }}
        onClick={() => {
          setSelectedAspect(null);
          setSelectedBody((value) => value === id ? null : id);
        }}
        onKeyDown={(event) => keyboardSelect(event, () => {
          setSelectedAspect(null);
          setSelectedBody((value) => value === id ? null : id);
        })}
        opacity={selectedBody && !selected ? 0.32 : 1}
        className="cursor-pointer focus:outline-none"
      >
        <title>{owner}: {BODY_NAMES[planet.key] ?? planet.key}, {positionCaption(planet.longitude)}</title>
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
      status={status}
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
          <div className="grid min-h-10 grid-cols-2 items-center gap-3 text-[11px] text-white/50">
            <span className="flex min-w-0 items-center justify-end gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400/70" />
              <span className="truncate" title={labelA}>{labelA}</span>
              <span className="shrink-0 text-white/35">внутри</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-pink-400/70" />
              <span className="truncate" title={labelB}>{labelB}</span>
              <span className="shrink-0 text-white/35">снаружи</span>
            </span>
          </div>
          <div className="max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-white/55">
            <p className="mb-1.5 text-white/70">На круге {aspectLines.length} аспект{aspectLines.length === 1 ? "" : aspectLines.length < 5 ? "а" : "ов"}</p>
            <ul className="space-y-1">
              {aspectLines.length ? aspectLines.map((line, index) => (
                <li key={`${line.id ?? index}-text`}>
                  {labelA}: {BODY_NAMES[line.bodyAKey] ?? line.bodyAKey} — {ASPECT_NAMES[line.aspect] ?? line.aspect} — {labelB}: {BODY_NAMES[line.bodyBKey] ?? line.bodyBKey}; орб {line.orb ?? "—"}°
                </li>
              )) : <li>Аспекты по выбранному фильтру отсутствуют.</li>}
            </ul>
          </div>
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
        <WheelZodiacBand cx={cx} cy={cy} size={size} innerR={zodiacR} outerR={outerR} />
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
              onFocus={() => { setSelectedBody(null); setSelectedAspect(id); }}
              onClick={() => {
                setSelectedBody(null);
                setSelectedAspect((value) => value === id ? null : id);
              }}
              onKeyDown={(event) => keyboardSelect(event, () => {
                setSelectedBody(null);
                setSelectedAspect((value) => value === id ? null : id);
              })}
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
