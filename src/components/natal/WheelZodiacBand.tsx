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
  const ring = [
    `M ${cx + outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 0 ${cx - outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 0 ${cx + outerR} ${cy}`,
    `M ${cx + innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 1 ${cx - innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 1 ${cx + innerR} ${cy}`,
  ].join(" ");

  return (
    <>
      <path d={ring} fill="#e8c98a" fillOpacity="0.045" fillRule="evenodd" />
      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#e8c98a" strokeOpacity="0.28" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#e8c98a" strokeOpacity="0.18" strokeWidth={0.8} />
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
              stroke="#e8c98a"
              strokeOpacity="0.22"
              strokeWidth={0.8}
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ead7a8"
              fillOpacity="0.72"
              fontSize={size * 0.028}
              fontWeight="400"
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
