const SIGNS = [
  ["Овен", "♈"], ["Телец", "♉"], ["Близнецы", "♊"], ["Рак", "♋"],
  ["Лев", "♌"], ["Дева", "♍"], ["Весы", "♎"], ["Скорпион", "♏"],
  ["Стрелец", "♐"], ["Козерог", "♑"], ["Водолей", "♒"], ["Рыбы", "♓"],
] as const;

export function wheelPolar(cx: number, cy: number, radius: number, longitude: number) {
  const radians = ((90 - longitude) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) };
}

type Props = {
  cx: number;
  cy: number;
  size: number;
  innerR: number;
  outerR: number;
  rotation?: number;
};

export default function WheelZodiacBand({ cx, cy, size, innerR, outerR, rotation = 0 }: Props) {
  return (
    <>
      {SIGNS.map(([name, glyph], index) => {
        const start = index * 30;
        const points = [
          wheelPolar(cx, cy, innerR, start + rotation),
          wheelPolar(cx, cy, outerR, start + rotation),
          wheelPolar(cx, cy, outerR, start + 30 + rotation),
          wheelPolar(cx, cy, innerR, start + 30 + rotation),
        ];
        const mid = wheelPolar(cx, cy, (innerR + outerR) / 2, start + 15 + rotation);
        return (
          <g key={name}>
            <path
              d={`M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} A ${outerR} ${outerR} 0 0 1 ${points[2].x} ${points[2].y} L ${points[3].x} ${points[3].y} A ${innerR} ${innerR} 0 0 0 ${points[0].x} ${points[0].y}`}
              fill={index % 2 ? "#ffffff06" : "#fbbf240d"}
              stroke="#ffffff20"
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fef3c7cc"
              fontSize={size * 0.04}
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
