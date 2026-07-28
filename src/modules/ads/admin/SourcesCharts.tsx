"use client";

type Daily = { date: string; visits: number; users: number; organicVisits: number };

function maxOf(rows: Daily[], key: keyof Daily): number {
  return Math.max(1, ...rows.map((r) => Number(r[key]) || 0));
}

export function TrafficLineChart({
  daily,
  height = 180,
}: {
  daily: Daily[];
  height?: number;
}) {
  if (!daily.length) {
    return (
      <p className="py-10 text-center text-sm text-gray-600">Нет данных за период</p>
    );
  }
  const w = 640;
  const h = height;
  const pad = { t: 16, r: 12, b: 28, l: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = maxOf(daily, "visits");
  const x = (i: number) => pad.l + (daily.length <= 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxV) * innerH;

  const line = (key: "visits" | "organicVisits") =>
    daily
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(Number(d[key]) || 0).toFixed(1)}`)
      .join(" ");

  const area =
    `${line("visits")} L ${x(daily.length - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)}` +
    ` L ${x(0).toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;

  const ticks = [0, 0.5, 1].map((t) => Math.round(maxV * t));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[480px]" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.06)"
            />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-gray-600" fontSize="10">
              {t}
            </text>
          </g>
        ))}
        <path d={area} fill="rgba(212,175,55,0.12)" />
        <path d={line("visits")} fill="none" stroke="rgba(212,175,55,0.9)" strokeWidth="2" />
        <path
          d={line("organicVisits")}
          fill="none"
          stroke="rgba(52,211,153,0.9)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {daily.map((d, i) =>
          i % Math.ceil(daily.length / 8) === 0 || i === daily.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={h - 8}
              textAnchor="middle"
              className="fill-gray-600"
              fontSize="9"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-aura-gold" /> Все визиты
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400" />{" "}
          Из поиска (organic)
        </span>
      </div>
    </div>
  );
}

export function HorizontalBars({
  items,
  valueKey = "visits",
}: {
  items: { label: string; value: number; hint?: string }[];
  valueKey?: string;
}) {
  void valueKey;
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) {
    return <p className="text-sm text-gray-600">Нет данных</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label}>
          <div className="mb-0.5 flex justify-between gap-2 text-xs">
            <span className="truncate text-gray-300" title={it.label}>
              {it.label}
            </span>
            <span className="shrink-0 text-gray-500">
              {it.value.toLocaleString("ru-RU")}
              {it.hint ? ` · ${it.hint}` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-aura-gold/70"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
