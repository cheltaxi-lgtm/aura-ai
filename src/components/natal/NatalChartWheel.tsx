"use client";

import { useId, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { mod360 } from "@/lib/natal/math";
import { ASPECT_NAMES, BODY_NAMES, asRecord, signLabel, signName } from "@/lib/natal/presentation";
import { layoutWheelBodies, wheeledRadius } from "@/lib/natal/wheel-layout";

const SIGNS = [
  ["Овен", "♈"], ["Телец", "♉"], ["Близнецы", "♊"], ["Рак", "♋"],
  ["Лев", "♌"], ["Дева", "♍"], ["Весы", "♎"], ["Скорпион", "♏"],
  ["Стрелец", "♐"], ["Козерог", "♑"], ["Водолей", "♒"], ["Рыбы", "♓"],
] as const;

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

function polar(cx: number, cy: number, radius: number, longitude: number) {
  const radians = ((90 - longitude) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) };
}

function keyboardSelect(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export default function NatalChartWheel({ western, timeKnown, size = 520 }: Props) {
  const gradientId = useId().replace(/:/g, "");
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState<Selection>(null);
  const [nature, setNature] = useState<"all" | "major" | "minor">("all");
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.475;
  const zodiacR = size * 0.405;
  const planetBase = size * 0.355;
  const laneStep = size * 0.026;
  const houseOuterR = size * 0.22;
  const houseInnerR = size * 0.16;
  const houseLabelR = size * 0.19;
  const aspectR = size * 0.13;
  const asc = timeKnown ? longitudeOf(western.rising) : null;
  const rotation = asc == null ? 0 : 270 - asc;

  const houses = useMemo(() => {
    if (!timeKnown || !Array.isArray(western.houses)) return [];
    return western.houses.flatMap((item) => {
      const house = asRecord(item);
      return typeof house?.house === "number" && typeof house.longitude === "number"
        ? [{ house: house.house, longitude: house.longitude }]
        : [];
    });
  }, [timeKnown, western.houses]);

  const bodies = useMemo(() => {
    const items: Array<Omit<WheelBody, "lane" | "displayLongitude">> = PLANETS.flatMap(([key, glyph, color]) => {
      const body = key === "sun" || key === "moon" ? western[key] : asRecord(western.planets)?.[key];
      const longitude = longitudeOf(body);
      if (longitude == null) return [];
      const record = asRecord(body);
      const sign = signName(body);
      return [{ key, glyph, color, longitude, sign: sign ? signLabel(sign) : null, retrograde: record?.retrograde === true }];
    });
    if (timeKnown) {
      for (const [key, glyph, color] of [["rising", "ASC", "#34d399"], ["midheaven", "MC", "#fb923c"]] as const) {
        const longitude = longitudeOf(western[key]);
        const bodySign = signName(western[key]);
        if (longitude != null) items.push({ key, glyph, color, longitude, sign: bodySign ? signLabel(bodySign) : null, retrograde: false });
      }
    }
    return layoutWheelBodies(items, 8, 5, { stayInSign: true });
  }, [timeKnown, western]);

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

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Какие аспекты показать">
          {(["all", "major", "minor"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setNature(value)}
              aria-pressed={nature === value}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${nature === value ? "border-amber-300/40 bg-amber-300/15 text-amber-100" : "border-white/10 text-white/50 hover:text-white"}`}>
              {value === "all" ? "Все" : value === "major" ? "Основные" : "Дополнительные"}
            </button>
          ))}
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[620px]"
          role="group" aria-label={timeKnown ? "Интерактивное натальное колесо" : "Интерактивное натальное колесо без домов и углов"}>
          <title>Интерактивная натальная карта</title>
          <desc>{timeKnown ? "Выберите планету, дом или аспект, чтобы увидеть подробности." : "Время рождения неизвестно: дома, асцендент и MC не показаны."}</desc>
          <defs><radialGradient id={gradientId}><stop offset="0%" stopColor="#1e1b4b" /><stop offset="100%" stopColor="#0b0713" /></radialGradient></defs>
          <circle cx={cx} cy={cy} r={outerR + 4} fill={`url(#${gradientId})`} stroke="#fbbf2440" />
          {SIGNS.map(([name, glyph], index) => {
            const start = index * 30;
            const points = [
              polar(cx, cy, zodiacR, start + rotation), polar(cx, cy, outerR, start + rotation),
              polar(cx, cy, outerR, start + 30 + rotation), polar(cx, cy, zodiacR, start + 30 + rotation),
            ];
            const mid = polar(cx, cy, (zodiacR + outerR) / 2, start + 15 + rotation);
            return <g key={name}>
              <path d={`M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} A ${outerR} ${outerR} 0 0 1 ${points[2].x} ${points[2].y} L ${points[3].x} ${points[3].y} A ${zodiacR} ${zodiacR} 0 0 0 ${points[0].x} ${points[0].y}`} fill={index % 2 ? "#ffffff06" : "#fbbf240d"} stroke="#ffffff20" />
              <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="#fef3c7cc" fontSize={size * .052}>{glyph}</text>
            </g>;
          })}
          <circle cx={cx} cy={cy} r={houseOuterR} fill="none" stroke="#fbbf2428" />
          <circle cx={cx} cy={cy} r={houseInnerR} fill="none" stroke="#fbbf2428" />
          {houses.map((house) => {
            const next = houses.find((item) => item.house === (house.house % 12) + 1) ?? houses[0];
            const midLongitude = next
              ? mod360(house.longitude + mod360(next.longitude - house.longitude) / 2)
              : house.longitude;
            const outer = polar(cx, cy, houseOuterR, house.longitude + rotation);
            const inner = polar(cx, cy, houseInnerR, house.longitude + rotation);
            const label = polar(cx, cy, houseLabelR, midLongitude + rotation);
            const selected = selection?.kind === "house" && selection.id === String(house.house);
            const action = () => setSelection({ kind: "house", id: String(house.house), title: `${house.house} дом`, detail: `Куспид: ${house.longitude.toFixed(2)}° · система ${String(western.houseSystem ?? "не указана")}` });
            return <g key={house.house} role="button" tabIndex={0} aria-label={`Дом ${house.house}`} onClick={action} onKeyDown={(event) => keyboardSelect(event, action)} className="cursor-pointer focus:outline-none">
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={selected ? "#fff7d6" : "#fbbf24"} strokeOpacity={selected ? 1 : .55} strokeWidth={selected ? 3 : 1} />
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="#fde68a" fontSize={size * .024}>{house.house}</text>
            </g>;
          })}
          <circle cx={cx} cy={cy} r={zodiacR} fill="none" stroke="#fbbf2455" />
          <circle cx={cx} cy={cy} r={aspectR} fill="#08050e" fillOpacity=".35" stroke="#ffffff18" />
          {aspects.map((aspect) => {
            const first = polar(cx, cy, aspectR, aspect.firstLongitude + rotation);
            const second = polar(cx, cy, aspectR, aspect.secondLongitude + rotation);
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
            const point = polar(cx, cy, radius, body.displayLongitude + rotation);
            const tick = polar(cx, cy, zodiacR, body.longitude + rotation);
            const selected = selection?.kind === "body" && selection.id === body.key;
            const highlighted = selected || related.has(body.key);
            const action = () => selectBody(body);
            return <g key={body.key} role="button" tabIndex={0} aria-label={`${BODY_NAMES[body.key] ?? body.key}, ${body.longitude.toFixed(1)} градусов`}
              onClick={action} onKeyDown={(event) => keyboardSelect(event, action)}
              className={`cursor-pointer focus:outline-none ${reducedMotion ? "" : "transition-opacity"}`} opacity={selection?.kind === "body" && !highlighted ? .38 : 1}>
              <line x1={tick.x} y1={tick.y} x2={point.x} y2={point.y} stroke={body.color} strokeOpacity=".6" />
              <circle cx={point.x} cy={point.y} r={size * (selected ? .033 : .027)} fill="#100a1d" stroke={body.color} strokeWidth={selected ? 3 : 1.5} />
              <text x={point.x} y={point.y} textAnchor="middle" dominantBaseline="middle" fill={body.color} fontSize={body.key === "rising" || body.key === "midheaven" ? size * .024 : size * .04} fontWeight="600">{body.glyph}</text>
            </g>;
          })}
        </svg>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <section className="min-h-28 rounded-xl border border-amber-300/15 bg-black/25 p-4" aria-live="polite">
          <p className="text-[10px] uppercase tracking-[.18em] text-amber-200/50">Выбранный объект</p>
          {selection ? <>
            <h3 className="mt-2 font-medium text-white">{selection.title}</h3>
            <p className="mt-1 text-xs leading-5 text-white/55">{selection.detail}</p>
          </> : <p className="mt-2 text-xs leading-5 text-white/45">Нажмите на планету, линию аспекта или номер дома. Доступна навигация Tab, Enter и Space.</p>}
        </section>
        <section>
          <h3 className="text-xs font-medium text-white/65">Легенда аспектов</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(ASPECT_COLORS).map(([type, color]) => (
              <span key={type} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/55">
                <span className="h-0.5 w-3" style={{ backgroundColor: color }} /> {ASPECT_NAMES[type] ?? type}
              </span>
            ))}
          </div>
        </section>
        <section className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
          <h3 className="text-xs font-medium text-white/65">Текстовая версия карты</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-white/50">
            {bodies.map((body) => <li key={body.key}>{BODY_NAMES[body.key] ?? body.key}: {body.sign ?? "знак не указан"}, {body.longitude.toFixed(2)}°{body.retrograde ? ", ретроградно" : ""}</li>)}
            {timeKnown ? houses.map((house) => <li key={`text-${house.house}`}>{house.house} дом: куспид {house.longitude.toFixed(2)}°</li>) : <li>Дома и углы скрыты: точное время рождения неизвестно.</li>}
          </ul>
        </section>
      </aside>
    </div>
  );
}
