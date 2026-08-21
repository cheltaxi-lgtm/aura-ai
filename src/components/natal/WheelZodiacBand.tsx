import { chartPolar } from "@/lib/natal/chart-angle";

const SIGNS = [
  ["Овен", "♈", "#c45c48"], ["Телец", "♉", "#7d8a52"], ["Близнецы", "♊", "#6d8aa8"],
  ["Рак", "♋", "#3d7a7c"], ["Лев", "♌", "#c47a3a"], ["Дева", "♍", "#6e7d4a"],
  ["Весы", "♎", "#5a7a9a"], ["Скорпион", "♏", "#6a3d5c"], ["Стрелец", "♐", "#b86840"],
  ["Козерог", "♑", "#6a6a58"], ["Водолей", "♒", "#5a6e88"], ["Рыбы", "♓", "#3a6a72"],
] as const;

export function wheelPolar(
  cx: number,
  cy: number,
  radius: number,
  longitude: number,
  originLongitude = 0,
) {
  return chartPolar(cx, cy, radius, longitude, originLongitude);
}

function annularSector(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startLon: number,
  endLon: number,
  originLongitude: number,
) {
  const steps = 10;
  const span = endLon - startLon;
  const outer = Array.from({ length: steps + 1 }, (_, index) => (
    chartPolar(cx, cy, outerR, startLon + (span * index) / steps, originLongitude)
  ));
  const inner = Array.from({ length: steps + 1 }, (_, index) => (
    chartPolar(cx, cy, innerR, startLon + (span * index) / steps, originLongitude)
  ));
  const tail = inner.slice().reverse();
  return [
    `M ${outer[0].x} ${outer[0].y}`,
    ...outer.slice(1).map((point) => `L ${point.x} ${point.y}`),
    ...tail.map((point) => `L ${point.x} ${point.y}`),
    "Z",
  ].join(" ");
}

type Props = {
  cx: number;
  cy: number;
  size: number;
  innerR: number;
  outerR: number;
  originLongitude?: number;
};

export default function WheelZodiacBand({
  cx, cy, size, innerR, outerR, originLongitude = 0,
}: Props) {
  const glyphR = (innerR + outerR) / 2;
  const tickLen = Math.max(3, (outerR - innerR) * 0.22);

  return (
    <>
      {SIGNS.map(([name, , fill], index) => (
        <path
          key={`${name}-fill`}
          d={annularSector(cx, cy, innerR, outerR, index * 30, index * 30 + 30, originLongitude)}
          fill={fill}
          fillOpacity="0.28"
        />
      ))}
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#e8c98a" strokeOpacity="0.55" strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={outerR - 2.2} fill="none" stroke="#e8c98a" strokeOpacity="0.18" strokeWidth={0.7} />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#e8c98a" strokeOpacity="0.32" strokeWidth={1} />
      {Array.from({ length: 72 }, (_, index) => {
        const longitude = index * 5;
        if (longitude % 30 === 0) return null;
        const major = longitude % 10 === 0;
        const inner = chartPolar(cx, cy, innerR, longitude, originLongitude);
        const outer = chartPolar(cx, cy, innerR + (major ? tickLen : tickLen * 0.55), longitude, originLongitude);
        return (
          <line
            key={longitude}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="#e8c98a"
            strokeOpacity={major ? 0.38 : 0.2}
            strokeWidth={major ? 1 : 0.7}
          />
        );
      })}
      {SIGNS.map(([name, glyph], index) => {
        const start = index * 30;
        const tickInner = chartPolar(cx, cy, innerR, start, originLongitude);
        const tickOuter = chartPolar(cx, cy, outerR, start, originLongitude);
        const mid = chartPolar(cx, cy, glyphR, start + 15, originLongitude);
        return (
          <g key={name}>
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOuter.x}
              y2={tickOuter.y}
              stroke="#f3e6c4"
              strokeOpacity="0.42"
              strokeWidth={1.15}
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#f6e7c4"
              fillOpacity="0.94"
              fontSize={Math.max(13, size * 0.034)}
              fontWeight="500"
              fontFamily='"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols", "Noto Sans Symbols 2", sans-serif'
              aria-label={name}
            >
              {glyph}
            </text>
          </g>
        );
      })}
    </>
  );
}
