"use client";

import { useId, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { chartPolar } from "@/lib/natal/chart-angle";
import { mod360 } from "@/lib/natal/math";
import { ASPECT_NAMES, BODY_NAMES, asRecord, signLabel, signName } from "@/lib/natal/presentation";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";
import WheelZodiacBand from "./WheelZodiacBand";

const PLANETS = [
  ["sun", "☉", "#fbbf24"], ["moon", "☽", "#e2e8f0"], ["mercury", "☿", "#94a3b8"],
  ["venus", "♀", "#f472b6"], ["mars", "♂", "#ef4444"], ["jupiter", "♃", "#a78bfa"],
  ["saturn", "♄", "#94a3b8"], ["uranus", "♅", "#22d3ee"], ["neptune", "♆", "#818cf8"],
  ["pluto", "♇", "#c084fc"],
] as const;

const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#fbbf24", sextile: "#34d399", square: "#ef4444",
  trine: "#60a5fa", opposition: "#f97316", "semi-sextile": "#a3a3a3", quincunx: "#d8b4fe",
};

type Selection =
  | { kind: "body"; id: string; title: string; detail: string }
  | { kind: "house"; id: string; title: string; detail: string }
  | { kind: "aspect"; id: string; title: string; detail: string }
  | { kind: "axis"; id: string; title: string; detail: string }
  | null;

type Props = { western: Record<string, unknown>; timeKnown: boolean; size?: number };
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

export default function NatalChartWheel({ western, timeKnown, size = 560 }: Props) {
  const gradientId = useId().replace(/:/g, "");
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(null);
  const [nature, setNature] = useState<"all" | "major" | "minor">("all");
  const compact = size < 480;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.48;
  const zodiacR = size * 0.418;
  const planetBase = size * 0.34;
  const laneStep = size * 0.03;
  const houseInnerR = size * 0.09;
  const houseLabelR = size * 0.175;
  const aspectR = size * 0.125;
  const axisLabelR = size * 0.392;
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
      { id: "horizon", color: "#34d399", ends: [
        { id: "asc", title: "ASC", longitude: asc },
        { id: "dsc", title: "DSC", longitude: dsc },
      ] },
    ];
    if (mcLon != null && ic != null) {
      items.push({
        id: "meridian", color: "#fb923c",
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
  const related = selection?.kind === "body"
    ? new Set(aspects.flatMap((aspect) => aspect.first === selection.id ? [aspect.second] : aspect.second === selection.id ? [aspect.first] : []))
    : new Set<string>();

  const selectBody = (body: WheelBody) => setSelection({
    kind: "body", id: body.key, title: BODY_NAMES[body.key] ?? body.key,
    detail: `${body.sign ?? "Знак не указан"} · ${body.longitude.toFixed(2)}°${body.retrograde ? " · ретроградно" : ""}`,
  });

  const shell = compact
    ? "flex w-full min-w-0 flex-col gap-3"
    : "grid w-full min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,13.5rem)]";

  return (
    <div className={shell}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2" aria-label="Какие аспекты показать">
          {(["all", "major", "minor"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setNature(value)}
              aria-pressed={nature === value}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${nature === value ? "border-amber-300/40 bg-amber-300/15 text-amber-100" : "border-white/10 text-white/50 hover:text-white"}`}>
              {value === "all" ? "Все" : value === "major" ? "Основные" : "Дополнительные"}
            </button>
          ))}
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full"
          role="group" aria-label={timeKnown ? "Интерактивное натальное колесо" : "Интерактивное натальное колесо без домов и углов"}>
          <title>Интерактивная натальная карта</title>
          <desc>{timeKnown ? "Выберите планету, дом или аспект, чтобы увидеть подробности." : "Время рождения неизвестно: дома, асцендент и MC не показаны."}</desc>
          <defs><radialGradient id={gradientId}><stop offset="0%" stopColor="#1e1b4b" /><stop offset="100%" stopColor="#0b0713" /></radialGradient></defs>
          <circle cx={cx} cy={cy} r={outerR + 2} fill={`url(#${gradientId})`} stroke="#fbbf2430" />
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
              {cardinal ? null : <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={selected ? "#fff7d6" : "#fbbf24"} strokeOpacity={selected ? 1 : 0.2} strokeWidth={selected ? 2.2 : 0.9} />}
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#fde68acc" fontSize={size * .022}>{house.house}</text>
            </g>;
          })}

          {axes.map((axis) => {
            const [first, second] = axis.ends;
            const a = chartPolar(cx, cy, zodiacR, first.longitude, origin);
            const b = chartPolar(cx, cy, zodiacR, second.longitude, origin);
            const selected = selection?.kind === "axis" && (selection.id === first.id || selection.id === second.id);
            return (
              <g key={axis.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis.color} strokeOpacity={selected ? 1 : 0.8} strokeWidth={selected ? 2.6 : 1.7} />
                {axis.ends.map((end) => {
                  const label = chartPolar(cx, cy, axisLabelR, end.longitude, origin);
                  const action = () => setSelection({
                    kind: "axis", id: end.id, title: end.title,
                    detail: `${end.longitude.toFixed(2)}°`,
                  });
                  return (
                    <g key={end.id} role="button" tabIndex={0} aria-label={end.title} onClick={action} onKeyDown={(event) => keyboardSelect(event, action)} className="cursor-pointer focus:outline-none">
                      <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill={axis.color} fontSize={size * 0.02} fontWeight="600">{end.title}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          <circle cx={cx} cy={cy} r={aspectR} fill="#08050e" fillOpacity=".45" stroke="#ffffff14" />
          {aspects.map((aspect) => {
            const first = chartPolar(cx, cy, aspectR, aspect.firstLongitude, origin);
            const second = chartPolar(cx, cy, aspectR, aspect.secondLongitude, origin);
            const selected = selection?.kind === "aspect" && selection.id === aspect.id;
            const bodySelected = selection?.kind === "body" && (selection.id === aspect.first || selection.id === aspect.second);
            const action = () => setSelection({ kind: "aspect", id: aspect.id, title: ASPECT_NAMES[aspect.type] ?? aspect.type, detail: `${BODY_NAMES[aspect.first] ?? aspect.first} — ${BODY_NAMES[aspect.second] ?? aspect.second}${aspect.orb == null ? "" : ` · орб ${aspect.orb.toFixed(2)}°`}` });
            return <line key={aspect.id} role="button" tabIndex={0} aria-label={`${ASPECT_NAMES[aspect.type] ?? aspect.type}: ${BODY_NAMES[aspect.first] ?? aspect.first} и ${BODY_NAMES[aspect.second] ?? aspect.second}`}
              onClick={action} onKeyDown={(event) => keyboardSelect(event, action)}
              x1={first.x} y1={first.y} x2={second.x} y2={second.y}
              stroke={ASPECT_COLORS[aspect.type] ?? "#ffffff55"} strokeOpacity={selected ? 1 : bodySelected ? .85 : .38}
              strokeWidth={selected ? 4 : bodySelected ? 2.5 : 1.2} className="cursor-pointer focus:outline-none" />;
          })}
          {bodies.map((body) => {
            const radius = wheeledRadius(planetBase, body.lane, laneStep);
            const point = chartPolar(cx, cy, radius, body.displayLongitude, origin);
            const truePoint = chartPolar(cx, cy, planetBase, body.longitude, origin);
            const tick = chartPolar(cx, cy, zodiacR, body.longitude, origin);
            const selected = selection?.kind === "body" && selection.id === body.key;
            const highlighted = selected || related.has(body.key);
            const action = () => selectBody(body);
            return <g key={body.key} role="button" tabIndex={0} aria-label={`${BODY_NAMES[body.key] ?? body.key}, ${body.longitude.toFixed(1)} градусов`}
              onClick={action} onKeyDown={(event) => keyboardSelect(event, action)}
              className={`cursor-pointer focus:outline-none ${reducedMotion ? "" : "transition-opacity"}`} opacity={selection?.kind === "body" && !highlighted ? .38 : 1}>
              <line x1={tick.x} y1={tick.y} x2={truePoint.x} y2={truePoint.y} stroke={body.color} strokeOpacity=".35" />
              {body.lane !== 0 ? <line x1={truePoint.x} y1={truePoint.y} x2={point.x} y2={point.y} stroke={body.color} strokeOpacity=".55" /> : null}
              <circle cx={point.x} cy={point.y} r={size * (selected ? .03 : .024)} fill="#100a1d" stroke={body.color} strokeWidth={selected ? 2.4 : 1.4} />
              <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill={body.color} fontSize={size * .034} fontWeight="600">{body.glyph}</text>
            </g>;
          })}
        </svg>
        {compact ? (
          <p className="mt-2 text-[11px] leading-4 text-white/40">
            {selection ? `${selection.title}: ${selection.detail}` : "Нажмите планету, дом или аспект."}
          </p>
        ) : null}
      </div>

      {compact ? null : (
        <aside className="space-y-3 lg:sticky lg:top-24">
          {selection ? (
            <section className="rounded-xl border border-amber-300/15 bg-black/25 p-3" aria-live="polite">
              <p className="text-[10px] uppercase tracking-[.18em] text-amber-200/50">Выбранный объект</p>
              <h3 className="mt-1.5 text-sm font-medium text-white">{selection.title}</h3>
              <p className="mt-0.5 text-xs leading-5 text-white/55">{selection.detail}</p>
            </section>
          ) : (
            <p className="text-[11px] leading-5 text-white/40">Нажмите планету, куспид или аспект. Tab, Enter, Space.</p>
          )}
          <section>
            <h3 className="text-[11px] font-medium text-white/50">Аспекты</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Object.entries(ASPECT_COLORS).map(([type, color]) => (
                <span key={type} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-white/45">
                  <span className="h-0.5 w-2.5" style={{ backgroundColor: color }} /> {ASPECT_NAMES[type] ?? type}
                </span>
              ))}
            </div>
          </section>
        </aside>
      )}

      <details className={`rounded-xl border border-white/10 bg-black/20 p-3 ${compact ? "" : "lg:col-span-2"}`}>
        <summary className="cursor-pointer text-sm text-white/75">Текстовая версия карты</summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs leading-5 text-white/55 sm:grid-cols-2">
          {bodies.map((body) => <li key={body.key}>{BODY_NAMES[body.key] ?? body.key}: {body.sign ?? "знак не указан"}, {body.longitude.toFixed(2)}°{body.retrograde ? ", ретроградно" : ""}</li>)}
          {timeKnown ? houses.map((house) => <li key={`text-${house.house}`}>{house.house} дом: куспид {house.longitude.toFixed(2)}°</li>) : <li>Дома и углы скрыты: точное время рождения неизвестно.</li>}
          {axisEnds.map((end) => <li key={`text-${end.id}`}>{end.title}: {end.longitude.toFixed(2)}°</li>)}
        </ul>
      </details>
    </div>
  );
}
