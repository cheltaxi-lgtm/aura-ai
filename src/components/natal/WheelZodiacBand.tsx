import { chartPolar } from "@/lib/natal/chart-angle";

const SIGNS = [
  ["Овен", "♈"], ["Телец", "♉"], ["Близнецы", "♊"], ["Рак", "♋"],
  ["Лев", "♌"], ["Дева", "♍"], ["Весы", "♎"], ["Скорпион", "♏"],
  ["Стрелец", "♐"], ["Козерог", "♑"], ["Водолей", "♒"], ["Рыбы", "♓"],
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
  return (
    <>
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#fbbf2433" strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#fbbf2440" />
      {SIGNS.map(([name, glyph], index) => {
        const start = index * 30;
        const tickInner = chartPolar(cx, cy, innerR, start, originLongitude);
        const tickOuter = chartPolar(cx, cy, outerR, start, originLongitude);
        const mid = chartPolar(cx, cy, (innerR + outerR) / 2, start + 15, originLongitude);
        return (
          <g key={name}>
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOuter.x}
              y2={tickOuter.y}
              stroke="#fde68a28"
              strokeWidth={1}
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fef3c7a6"
              fontSize={size * 0.032}
              fontWeight="500"
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
