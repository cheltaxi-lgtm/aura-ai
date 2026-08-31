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
  const pad = { t: 18, r: 12, b: 28, l: 36 };
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

  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(maxV * t)))];

  // Value labels: every point when sparse, otherwise ~10 stride labels + last + peak.
  const labelEvery = Math.max(1, Math.ceil(daily.length / 10));
  const peakIdx = daily.reduce(
    (mi, d, i) => (Number(d.visits) > Number(daily[mi].visits) ? i : mi),
    0
  );
  const showLabel = (i: number) =>
    daily.length <= 12 || i % labelEvery === 0 || i === daily.length - 1 || i === peakIdx;

  const totalVisits = daily.reduce((s, d) => s + (Number(d.visits) || 0), 0);
  const totalOrganic = daily.reduce((s, d) => s + (Number(d.organicVisits) || 0), 0);
  const last = daily[daily.length - 1];

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
            {/* NB: src/modules is outside Tailwind content globs — use fill attributes, not fill-* classes */}
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fill="#4b5563" fontSize="10">
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
        {daily.map((d, i) => (
          <g key={`pt-${d.date}`}>
            <circle cx={x(i)} cy={y(Number(d.visits) || 0)} r="2.6" fill="rgba(212,175,55,1)">
              <title>{`${d.date.slice(5)} — визиты: ${d.visits}, из поиска: ${d.organicVisits}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(Number(d.organicVisits) || 0)} r="2.2" fill="rgba(52,211,153,1)">
              <title>{`${d.date.slice(5)} — из поиска: ${d.organicVisits}, визиты: ${d.visits}`}</title>
            </circle>
          </g>
        ))}
        {daily.map((d, i) =>
          showLabel(i) ? (
            <text
              key={`vl-${d.date}`}
              x={x(i)}
              y={y(Number(d.visits) || 0) - 7}
              textAnchor="middle"
              fill="rgba(254,243,199,0.85)"
              fontSize="9"
            >
              {d.visits}
            </text>
          ) : null
        )}
        {daily.map((d, i) =>
          // Skip the under-dot label when it would collide with the date axis.
          showLabel(i) && y(Number(d.organicVisits) || 0) + 13 < h - 16 ? (
            <text
              key={`vo-${d.date}`}
              x={x(i)}
              y={y(Number(d.organicVisits) || 0) + 13}
              textAnchor="middle"
              fill="rgba(167,243,208,0.75)"
              fontSize="8.5"
            >
              {d.organicVisits}
            </text>
          ) : null
        )}
        {daily.map((d, i) =>
          i % Math.ceil(daily.length / 8) === 0 || i === daily.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={h - 8}
              textAnchor="middle"
              fill="#4b5563"
              fontSize="9"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-aura-gold" />
          Все визиты: <span className="text-gray-300">{totalVisits.toLocaleString("ru-RU")}</span>
          {" "}за период · {last.date.slice(5)}:{" "}
          <span className="text-gray-300">{last.visits.toLocaleString("ru-RU")}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400" />
          Из поиска (organic): <span className="text-gray-300">{totalOrganic.toLocaleString("ru-RU")}</span>
          {" "}за период · {last.date.slice(5)}:{" "}
          <span className="text-gray-300">{last.organicVisits.toLocaleString("ru-RU")}</span>
        </span>
      </div>
    </div>
  );
}

export function DualLineChart({
  points,
  height = 120,
}: {
  points: { date: string; a: number; b: number }[];
  height?: number;
}) {
  if (!points.length) {
    return (
      <p className="py-6 text-center text-sm text-gray-600">Нет истории прогонов</p>
    );
  }
  const w = 640;
  const h = height;
  const pad = { t: 16, r: 12, b: 24, l: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = Math.max(1, ...points.flatMap((p) => [p.a, p.b]));
  const x = (i: number) =>
    pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxV) * innerH;
  const line = (key: "a" | "b") =>
    points
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`
      )
      .join(" ");

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const showLabel = (i: number) =>
    points.length <= 10 || i % labelEvery === 0 || i === points.length - 1;
  const last = points[points.length - 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[400px]" role="img">
        {[...new Set([0, 0.5, 1].map((t) => Math.round(maxV * t)))].map((v) => {
          return (
            <g key={v}>
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={y(v)}
                y2={y(v)}
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x={pad.l - 6}
                y={y(v) + 3}
                textAnchor="end"
                fill="#4b5563"
                fontSize="10"
              >
                {v}
              </text>
            </g>
          );
        })}
        <path d={line("a")} fill="none" stroke="rgba(212,175,55,0.9)" strokeWidth="2" />
        <path
          d={line("b")}
          fill="none"
          stroke="rgba(52,211,153,0.9)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        {points.map((d, i) => (
          <g key={`pt-${d.date}`}>
            <circle cx={x(i)} cy={y(d.a)} r="2.4" fill="rgba(212,175,55,1)">
              <title>{`${d.date.slice(5, 10)} — в теме: ${d.a}, в коридоре: ${d.b}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(d.b)} r="2.1" fill="rgba(52,211,153,1)">
              <title>{`${d.date.slice(5, 10)} — в коридоре: ${d.b}, в теме: ${d.a}`}</title>
            </circle>
          </g>
        ))}
        {points.map((d, i) =>
          showLabel(i) ? (
            <text
              key={`va-${d.date}`}
              x={x(i)}
              y={y(d.a) - 6}
              textAnchor="middle"
              fill="rgba(254,243,199,0.85)"
              fontSize="8.5"
            >
              {d.a}
            </text>
          ) : null
        )}
        {points.map((d, i) =>
          showLabel(i) && y(d.b) + 12 < h - 14 ? (
            <text
              key={`vb-${d.date}`}
              x={x(i)}
              y={y(d.b) + 12}
              textAnchor="middle"
              fill="rgba(167,243,208,0.75)"
              fontSize="8"
            >
              {d.b}
            </text>
          ) : null
        )}
        {points.map((d, i) =>
          i % Math.max(1, Math.ceil(points.length / 6)) === 0 ||
          i === points.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={h - 6}
              textAnchor="middle"
              fill="#4b5563"
              fontSize="9"
            >
              {d.date.slice(5, 10)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-aura-gold" />
          В теме · {last.date.slice(5, 10)}: <span className="text-gray-300">{last.a}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-emerald-400" />
          В коридоре · {last.date.slice(5, 10)}: <span className="text-gray-300">{last.b}</span>
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
