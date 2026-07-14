"use client";

import { useMemo } from "react";

const SIGNS = [
  "Овен",
  "Телец",
  "Близнецы",
  "Рак",
  "Лев",
  "Дева",
  "Весы",
  "Скорпион",
  "Стрелец",
  "Козерог",
  "Водолей",
  "Рыбы",
];

const PLANET_KEYS: Array<{ key: string; label: string; color: string }> = [
  { key: "sun", label: "☉", color: "#fbbf24" },
  { key: "moon", label: "☽", color: "#e2e8f0" },
  { key: "mercury", label: "☿", color: "#94a3b8" },
  { key: "venus", label: "♀", color: "#f472b6" },
  { key: "mars", label: "♂", color: "#ef4444" },
  { key: "jupiter", label: "♃", color: "#a78bfa" },
  { key: "saturn", label: "♄", color: "#64748b" },
];

const ASPECT_COLORS: Record<string, string> = {
  conjunction: "#fbbf24",
  sextile: "#34d399",
  square: "#ef4444",
  trine: "#60a5fa",
  opposition: "#f97316",
};

type Props = {
  western: Record<string, unknown>;
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

export default function NatalChartWheel({ western, size = 280 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.28;
  const houseR = size * 0.32;
  const planetR = size * 0.36;
  const ascLongitude = longitudeOf(western.rising);
  const longitudeRotation = ascLongitude == null ? 0 : 270 - ascLongitude;

  const houseCusps = useMemo(() => {
    const raw = western.houses;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((h) => {
        if (!h || typeof h !== "object") return null;
        const lon = (h as { longitude?: number }).longitude;
        const house = (h as { house?: number }).house;
        if (typeof lon !== "number" || typeof house !== "number") return null;
        return { house, longitude: lon };
      })
      .filter(Boolean) as Array<{ house: number; longitude: number }>;
  }, [western.houses]);

  const planets = useMemo(() => {
    const list: Array<{ key: string; label: string; color: string; longitude: number }> = [];
    for (const p of PLANET_KEYS) {
      const body =
        p.key === "sun" || p.key === "moon"
          ? western[p.key]
          : (western.planets as Record<string, unknown> | undefined)?.[p.key];
      const longitude = longitudeOf(body);
      if (longitude != null) list.push({ key: p.key, label: p.label, color: p.color, longitude });
    }
    const rising = longitudeOf(western.rising);
    if (rising != null) {
      list.push({ key: "asc", label: "ASC", color: "#34d399", longitude: rising });
    }
    return list;
  }, [western]);

  const aspectLines = useMemo(() => {
    const aspects = Array.isArray(western.aspects) ? western.aspects : [];
    const byKey = new Map(planets.map((p) => [p.key, p.longitude]));
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; color: string; orb: number }> = [];
    for (const a of aspects) {
      if (!a || typeof a !== "object") continue;
      const asp = a as {
        planet1?: string;
        planet2?: string;
        aspect?: string;
        nature?: string;
        orb?: number;
      };
      if (asp.nature !== "major") continue;
      const lon1 = byKey.get(String(asp.planet1));
      const lon2 = byKey.get(String(asp.planet2));
      if (lon1 == null || lon2 == null) continue;
      const p1 = polar(cx, cy, planetR, lon1 + longitudeRotation);
      const p2 = polar(cx, cy, planetR, lon2 + longitudeRotation);
      lines.push({
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        color: ASPECT_COLORS[String(asp.aspect)] ?? "#ffffff33",
        orb: typeof asp.orb === "number" ? asp.orb : Number.POSITIVE_INFINITY,
      });
    }
    return lines.sort((a, b) => a.orb - b.orb).slice(0, 10);
  }, [western.aspects, planets, cx, cy, planetR, longitudeRotation]);

  const houseSystem =
    typeof western.houseSystem === "string" ? western.houseSystem : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto w-full max-w-[320px]"
      role="img"
      aria-label="Натальное колесо"
    >
      <defs>
        <radialGradient id="wheelGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0f0a1a" stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={outerR + 4} fill="url(#wheelGlow)" stroke="#fbbf2440" strokeWidth="1" />
      {SIGNS.map((sign, i) => {
        const startLon = i * 30;
        const endLon = (i + 1) * 30;
        const p1 = polar(cx, cy, innerR, startLon + longitudeRotation);
        const p2 = polar(cx, cy, outerR, startLon + longitudeRotation);
        const p3 = polar(cx, cy, outerR, endLon + longitudeRotation);
        const p4 = polar(cx, cy, innerR, endLon + longitudeRotation);
        const mid = polar(cx, cy, (innerR + outerR) / 2, startLon + 15 + longitudeRotation);
        return (
          <g key={sign}>
            <path
              d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${outerR} ${outerR} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${innerR} ${innerR} 0 0 0 ${p1.x} ${p1.y}`}
              fill={i % 2 === 0 ? "#ffffff06" : "#ffffff03"}
              stroke="#ffffff12"
              strokeWidth="0.5"
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff55"
              fontSize={size * 0.038}
            >
              {sign.slice(0, 3)}
            </text>
          </g>
        );
      })}
      {houseCusps.map((h) => {
        const outer = polar(cx, cy, outerR, h.longitude + longitudeRotation);
        const inner = polar(cx, cy, houseR, h.longitude + longitudeRotation);
        return (
          <g key={`house-${h.house}`}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#fbbf2455"
              strokeWidth={h.house === 1 || h.house === 10 ? 1.2 : 0.6}
            />
            {h.house === 1 || h.house === 4 || h.house === 7 || h.house === 10 ? (
              <text
                x={polar(cx, cy, houseR - size * 0.04, h.longitude + longitudeRotation).x}
                y={polar(cx, cy, houseR - size * 0.04, h.longitude + longitudeRotation).y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fbbf2488"
                fontSize={size * 0.028}
              >
                {h.house}
              </text>
            ) : null}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#fbbf2433" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={planetR} fill="none" stroke="#ffffff10" strokeDasharray="3 4" />
      {aspectLines.map((line, idx) => (
        <line
          key={`asp-${idx}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.color}
          strokeOpacity={0.45}
          strokeWidth={0.8}
        />
      ))}
      {planets.map((p, idx) => {
        const { x, y } = polar(cx, cy, planetR, p.longitude + longitudeRotation);
        return (
          <g key={`${p.label}-${idx}`}>
            <circle cx={x} cy={y} r={size * 0.028} fill={p.color} fillOpacity="0.25" stroke={p.color} strokeWidth="1" />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={p.color}
              fontSize={size * 0.045}
              fontWeight="600"
            >
              {p.label}
            </text>
          </g>
        );
      })}
      {houseSystem ? (
        <text x={cx} y={size - 6} textAnchor="middle" fill="#ffffff44" fontSize={size * 0.028}>
          {houseSystem}
        </text>
      ) : null}
    </svg>
  );
}
