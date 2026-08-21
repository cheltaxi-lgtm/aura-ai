"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { chartPolar } from "@/lib/natal/chart-angle";
import { angularSeparation, mod360 } from "@/lib/natal/math";
import { ASPECT_NAMES, BODY_NAMES, asRecord, signLabel, signName } from "@/lib/natal/presentation";
import { layoutWheelBodies, natalLaneRadius } from "@/lib/natal/wheel-layout";
import { aspectLineStyle, isMajorAspect } from "@/lib/natal/wheel-style";
import WheelZodiacBand from "./WheelZodiacBand";

const PLANETS = [
  ["sun", "☉", "#e8c98a"], ["moon", "☽", "#e2e8f0"], ["mercury", "☿", "#a8b4c4"],
  ["venus", "♀", "#e8a0c0"], ["mars", "♂", "#e07a72"], ["jupiter", "♃", "#c4b5e8"],
  ["saturn", "♄", "#94a3b8"], ["uranus", "♅", "#7dd3e8"], ["neptune", "♆", "#8b9cf0"],
  ["pluto", "♇", "#c4a0e0"],
] as const;

const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#e8c98a", sextile: "#6ec8a0", square: "#e07a72",
  trine: "#7eb6e8", opposition: "#e0a070", "semi-sextile": "#9a9a9a", quincunx: "#c4b0d8",
};

type Selection =
  | { kind: "body"; id: string; title: string; detail: string }
  | { kind: "house"; id: string; title: string; detail: string }
  | { kind: "aspect"; id: string; title: string; detail: string }
  | { kind: "axis"; id: string; title: string; detail: string }
  | null;

type Props = {
  western: Record<string, unknown>;
  timeKnown: boolean;
  size?: number;
  summary?: ReactNode;
};
type WheelBody = {
  key: string;
  glyph: string;
  color: string;
  longitude: number;
  displayLongitude: number;
  lane: number;
  sign: string | null;
  retrograde: boolean;
};

export function longitudeOf(body: unknown): number | null {
  const longitude = asRecord(body)?.longitude;
  return typeof longitude === "number" && Number.isFinite(longitude) ? longitude : null;
}

export function filterAspectNature<T extends { nature: string }>(
  aspects: T[],
  filter: "all" | "major" | "minor"
): T[] {
  return filter === "all" ? aspects : aspects.filter((aspect) => aspect.nature === filter);
}

function keyboardSelect(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export default function NatalChartWheel({ western, timeKnown, size = 600, summary }: Props) {
  const gradientId = useId().replace(/:/g, "");
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredAspect, setHoveredAspect] = useState<string | null>(null);
  const [nature, setNature] = useState<"all" | "major" | "minor">("all");
  const compact = size < 480;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.478;
  const zodiacR = size * 0.412;
  const planetBase = size * 0.308;
  const laneStep = size * 0.044;
  const glyphR = size * 0.02;
  const aspectR = size * 0.168;
  const houseInnerR = aspectR + size * 0.016;
  const houseLabelR = (houseInnerR + zodiacR) / 2;
  const axisLabelR = size * 0.386;
  const laneMin = aspectR + glyphR * 2;
  const laneMax = zodiacR - glyphR * 2.2;
  const asc = timeKnown ? longitudeOf(western.rising) : null;
  const mc = timeKnown ? longitudeOf(western.midheaven) : null;
  const origin = asc ?? 0;

  const houses = useMemo(() => {
    if (!timeKnown || !Array.isArray(western.houses)) return [];
    return western.houses.flatMap((item) => {
      const house = asRecord(item);
      return typeof house?.house === "number" && typeof house.longitude === "number"
        ? [{ house: house.house, longitude: house.longitude }]
        : [];
    });
  }, [timeKnown, western.houses]);

  const axes = useMemo(() => {
    if (!timeKnown || asc == null) return [];
    const dsc = mod360(asc + 180);
    const ic = mc != null ? mod360(mc + 180) : houses.find((house) => house.house === 4)?.longitude ?? null;
    const mcLon = mc ?? houses.find((house) => house.house === 10)?.longitude ?? null;
    const items = [
      { id: "horizon", color: "#9dccb4", ends: [
        { id: "asc", title: "ASC", longitude: asc },
        { id: "dsc", title: "DSC", longitude: dsc },
      ] },
    ];
    if (mcLon != null && ic != null) {
      items.push({
        id: "meridian", color: "#e0b07a",
        ends: [
          { id: "mc", title: "MC", longitude: mcLon },
          { id: "ic", title: "IC", longitude: ic },
        ],
      });
    }
    return items;
  }, [timeKnown, asc, mc, houses]);
  const axisEnds = useMemo(() => axes.flatMap((axis) => axis.ends), [axes]);

  const bodies = useMemo(() => {
    const items: Array<Omit<WheelBody, "lane" | "displayLongitude">> = PLANETS.flatMap(([key, glyph, color]) => {
      const body = key === "sun" || key === "moon" ? western[key] : asRecord(western.planets)?.[key];
      const longitude = longitudeOf(body);
      if (longitude == null) return [];
      const record = asRecord(body);
      const sign = signName(body);
      return [{ key, glyph, color, longitude, sign: sign ? signLabel(sign) : null, retrograde: record?.retrograde === true }];
    });
    return layoutWheelBodies(items, 12, 6, { radialOnly: true });
  }, [western]);

  const allAspects = useMemo(() => {
    const byKey = new Map(bodies.map((body) => [body.key, body.longitude]));
    if (!Array.isArray(western.aspects)) return [];
    return western.aspects.flatMap((item, index) => {
      const aspect = asRecord(item);
      if (!aspect) return [];
      const first = typeof aspect?.planet1 === "string" ? aspect.planet1 : null;
      const second = typeof aspect?.planet2 === "string" ? aspect.planet2 : null;
      const type = typeof aspect?.aspect === "string" ? aspect.aspect : null;
      const firstLongitude = first ? byKey.get(first) : null;
      const secondLongitude = second ? byKey.get(second) : null;
      if (!first || !second || !type || firstLongitude == null || secondLongitude == null) return [];
      return [{
        id: `${first}-${type}-${second}-${index}`, first, second, type,
        nature: typeof aspect.nature === "string" ? aspect.nature : "unknown",
        orb: typeof aspect.orb === "number" ? aspect.orb : null,
        firstLongitude, secondLongitude,
      }];
    });
  }, [bodies, western.aspects]);

  const aspects = useMemo(
    () => filterAspectNature(allAspects, nature),
    [allAspects, nature]
  );
  const activeAspectId = selection?.kind === "aspect" ? selection.id : hoveredAspect;
  const related = selection?.kind === "body"
    ? new Set(aspects.flatMap((aspect) => aspect.first === selection.id ? [aspect.second] : aspect.second === selection.id ? [aspect.first] : []))
    : activeAspectId
      ? new Set(aspects.flatMap((aspect) => aspect.id === activeAspectId ? [aspect.first, aspect.second] : []))
      : new Set<string>();

  const selectBody = (body: WheelBody) => setSelection({
    kind: "body", id: body.key, title: BODY_NAMES[body.key] ?? body.key,
    detail: `${body.sign ?? "Знак не указан"} · ${body.longitude.toFixed(2)}°${body.retrograde ? " · ретроградно" : ""}`,
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {summary ? <div className="flex min-w-0 flex-wrap gap-2 text-xs text-white/50">{summary}</div> : null}
        <div className={`flex flex-wrap items-center gap-1 ${summary ? "sm:justify-end" : ""}`} aria-label="Какие аспекты показать">
          {(["all", "major", "minor"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setNature(value)}
              aria-pressed={nature === value}
              className={`rounded-full px-3 py-1.5 text-xs tracking-wide transition ${nature === value ? "bg-amber-200/12 text-amber-100" : "text-white/40 hover:text-white/70"}`}>
              {value === "all" ? "Все" : value === "major" ? "Основные" : "Дополнительные"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} className={`mx-auto h-auto w-full ${compact ? "max-w-full" : "max-w-[48rem]"}`}
        role="group" aria-label={timeKnown ? "Интерактивное натальное колесо" : "Интерактивное натальное колесо без домов и углов"}>
        <title>Интерактивная натальная карта</title>
        <desc>{timeKnown ? "Выберите планету, дом или аспект, чтобы увидеть подробности." : "Время рождения неизвестно: дома, асцендент и MC не показаны."}</desc>
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="#17121c" />
            <stop offset="100%" stopColor="#0a070e" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={outerR + 1.5} fill={`url(#${gradientId})`} stroke="#e8c98a" strokeOpacity="0.22" />
        <WheelZodiacBand cx={cx} cy={cy} size={size} innerR={zodiacR} outerR={outerR} originLongitude={origin} />

        {houses.map((house) => {
          const next = houses.find((item) => item.house === (house.house % 12) + 1) ?? houses[0];
          const midLongitude = next
            ? mod360(house.longitude + mod360(next.longitude - house.longitude) / 2)
            : house.longitude;
          const outer = chartPolar(cx, cy, zodiacR, house.longitude, origin);
          const inner = chartPolar(cx, cy, houseInnerR, house.longitude, origin);
          const label = chartPolar(cx, cy, houseLabelR, midLongitude, origin);
          const cardinal = house.house === 1 || house.house === 4 || house.house === 7 || house.house === 10;
          const selected = selection?.kind === "house" && selection.id === String(house.house);
          const action = () => setSelection({ kind: "house", id: String(house.house), title: `${house.house} дом`, detail: `Куспид: ${house.longitude.toFixed(2)}° · система ${String(western.houseSystem ?? "не указана")}` });
          return <g key={house.house} role="button" tabIndex={0} aria-label={`Дом ${house.house}`} onClick={action} onKeyDown={(event) => keyboardSelect(event, action)} className="cursor-pointer focus:outline-none">
            {cardinal ? null : <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={selected ? "#f4e6c4" : "#e8c98a"} strokeOpacity={selected ? 0.85 : 0.14} strokeWidth={selected ? 1.6 : 0.75} />}
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#e4d4b0" fillOpacity="0.72" fontSize={size * 0.022}>{house.house}</text>
          </g>;
        })}

        {axes.map((axis) => {
          const [first, second] = axis.ends;
          const a = chartPolar(cx, cy, houseInnerR, first.longitude, origin);
          const b = chartPolar(cx, cy, zodiacR, first.longitude, origin);
          const c = chartPolar(cx, cy, houseInnerR, second.longitude, origin);
          const d = chartPolar(cx, cy, zodiacR, second.longitude, origin);
          const selected = selection?.kind === "axis" && (selection.id === first.id || selection.id === second.id);
          return (
            <g key={axis.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis.color} strokeOpacity={selected ? 0.95 : 0.55} strokeWidth={selected ? 2 : 1.35} />
              <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke={axis.color} strokeOpacity={selected ? 0.95 : 0.55} strokeWidth={selected ? 2 : 1.35} />
              {axis.ends.map((end) => {
                const label = chartPolar(cx, cy, axisLabelR, end.longitude, origin);
                const action = () => setSelection({
                  kind: "axis", id: end.id, title: end.title,
                  detail: `${end.longitude.toFixed(2)}°`,
                });
                return (
                  <g key={end.id} role="button" tabIndex={0} aria-label={end.title} onClick={action} onKeyDown={(event) => keyboardSelect(event, action)} className="cursor-pointer focus:outline-none">
                    <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill={axis.color} fontSize={size * 0.022} fontWeight="600">{end.title}</text>
                  </g>
                );
              })}
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={aspectR} fill="#0a070e" fillOpacity=".42" stroke="#ffffff12" />
        {aspects.map((aspect) => {
          const first = chartPolar(cx, cy, aspectR, aspect.firstLongitude, origin);
          const second = chartPolar(cx, cy, aspectR, aspect.secondLongitude, origin);
          const selected = selection?.kind === "aspect" && selection.id === aspect.id;
          const bodySelected = selection?.kind === "body" && (selection.id === aspect.first || selection.id === aspect.second);
          const hovered = hoveredAspect === aspect.id;
          const emphasized = selected || hovered || bodySelected;
          const style = aspectLineStyle(aspect.type, emphasized);
          const faded = Boolean(activeAspectId || selection?.kind === "body") && !emphasized;
          const tight = angularSeparation(aspect.firstLongitude, aspect.secondLongitude) < 8;
          const action = () => setSelection({ kind: "aspect", id: aspect.id, title: ASPECT_NAMES[aspect.type] ?? aspect.type, detail: `${BODY_NAMES[aspect.first] ?? aspect.first} — ${BODY_NAMES[aspect.second] ?? aspect.second}${aspect.orb == null ? "" : ` · орб ${aspect.orb.toFixed(2)}°`}` });
          return (
            <g key={aspect.id} role="button" tabIndex={0}
              aria-label={`${ASPECT_NAMES[aspect.type] ?? aspect.type}: ${BODY_NAMES[aspect.first] ?? aspect.first} и ${BODY_NAMES[aspect.second] ?? aspect.second}`}
              onClick={action} onKeyDown={(event) => keyboardSelect(event, action)}
              onPointerEnter={() => setHoveredAspect(aspect.id)}
              onPointerLeave={() => setHoveredAspect((value) => value === aspect.id ? null : value)}
              className="cursor-pointer focus:outline-none">
              {tight ? (
                <>
                  <circle cx={first.x} cy={first.y} r={14} fill="transparent" />
                  <circle cx={first.x} cy={first.y} r={emphasized ? 7 : 5.5} fill="none"
                    stroke={ASPECT_COLORS[aspect.type] ?? "#ffffff55"}
                    strokeOpacity={faded ? 0.12 : style.opacity}
                    strokeWidth={style.width} />
                </>
              ) : (
                <>
                  <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} stroke="transparent" strokeWidth={12} />
                  <line x1={first.x} y1={first.y} x2={second.x} y2={second.y}
                    stroke={ASPECT_COLORS[aspect.type] ?? "#ffffff55"}
                    strokeOpacity={faded ? 0.12 : style.opacity}
                    strokeWidth={style.width} />
                </>
              )}
            </g>
          );
        })}
        {bodies.map((body) => {
          const radius = natalLaneRadius(planetBase, body.lane, laneStep, laneMin, laneMax);
          const point = chartPolar(cx, cy, radius, body.longitude, origin);
          const truePoint = chartPolar(cx, cy, planetBase, body.longitude, origin);
          const tick = chartPolar(cx, cy, zodiacR, body.longitude, origin);
          const selected = selection?.kind === "body" && selection.id === body.key;
          const highlighted = selected || related.has(body.key);
          const action = () => selectBody(body);
          return <g key={body.key} role="button" tabIndex={0} aria-label={`${BODY_NAMES[body.key] ?? body.key}, ${body.longitude.toFixed(1)} градусов`}
            onClick={action} onKeyDown={(event) => keyboardSelect(event, action)}
            className={`cursor-pointer focus:outline-none ${reducedMotion ? "" : "transition-opacity"}`} opacity={selection?.kind === "body" && !highlighted ? .32 : 1}>
            <line x1={tick.x} y1={tick.y} x2={truePoint.x} y2={truePoint.y} stroke={body.color} strokeOpacity=".26" />
            {Math.abs(radius - planetBase) > 1 ? <line x1={truePoint.x} y1={truePoint.y} x2={point.x} y2={point.y} stroke={body.color} strokeOpacity=".55" /> : null}
            <circle cx={point.x} cy={point.y} r={size * (selected || highlighted ? .026 : .021)} fill="#100a16" stroke={body.color} strokeWidth={selected || highlighted ? 2.1 : 1.25} />
            <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill={body.color} fontSize={size * .03} fontWeight="500">{body.glyph}</text>
          </g>;
        })}
      </svg>

      <div className="rounded-2xl bg-white/[0.035] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <p className="min-w-0 text-sm leading-6" aria-live="polite">
            {selection ? (
              <>
                <span className="text-[11px] uppercase tracking-[.16em] text-amber-200/45">Объект</span>
                <span className="mt-1 block font-medium text-white/92">{selection.title}</span>
                <span className="block text-white/50">{selection.detail}</span>
              </>
            ) : (
              <span className="text-white/42">Нажмите планету, ось или аспект</span>
            )}
          </p>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs leading-5 text-white/45">
            {Object.entries(ASPECT_COLORS).map(([type, color]) => (
              <li key={type} className="inline-flex items-center gap-1.5">
                <span className="w-3.5 rounded-full" style={{ backgroundColor: color, height: isMajorAspect(type) ? 2.5 : 1.25 }} />
                {ASPECT_NAMES[type] ?? type}
              </li>
            ))}
          </ul>
        </div>
        <details className="mt-3 border-t border-white/[0.06] pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-white/62 hover:text-white/85 [&::-webkit-details-marker]:hidden">
            Текстовая версия карты
          </summary>
          <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-sm leading-6 text-white/52 sm:grid-cols-2">
            {bodies.map((body) => <li key={body.key}>{BODY_NAMES[body.key] ?? body.key}: {body.sign ?? "знак не указан"}, {body.longitude.toFixed(2)}°{body.retrograde ? ", ретроградно" : ""}</li>)}
            {timeKnown ? houses.map((house) => <li key={`text-${house.house}`}>{house.house} дом: куспид {house.longitude.toFixed(2)}°</li>) : <li>Дома и углы скрыты: точное время рождения неизвестно.</li>}
            {axisEnds.map((end) => <li key={`text-${end.id}`}>{end.title}: {end.longitude.toFixed(2)}°</li>)}
          </ul>
        </details>
      </div>
    </div>
  );
}
