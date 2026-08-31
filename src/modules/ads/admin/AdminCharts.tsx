"use client";

/**
 * Generic admin charts (funnel, multi-line, spend combo, positions).
 *
 * NB: src/modules is outside Tailwind content globs — SVG colors must use
 * fill/stroke presentation attributes, never Tailwind fill-* or stroke-* classes.
 */

const AXIS = "#4b5563";
const GRID = "rgba(255,255,255,0.06)";
const GOLD = "rgba(212,175,55,0.9)";
const EMERALD = "rgba(52,211,153,0.9)";

const fmtRu = (v: number) => Math.round(v).toLocaleString("ru-RU");

/* ------------------------------ MultiLine ------------------------------ */

export type MultiPoint = { date: string; [key: string]: string | number };

export type MultiSeries = {
  key: string;
  label: string;
  color: string;
  dash?: boolean;
  /** stride = every ~8th point + last; last = only the final point; none */
  labels?: "stride" | "last" | "none";
  labelPos?: "above" | "below";
  format?: (v: number) => string;
};

export function MultiLineChart({
  points,
  series,
  height = 180,
  emptyText = "Нет данных за период",
}: {
  points: MultiPoint[];
  series: MultiSeries[];
  height?: number;
  emptyText?: string;
}) {
  if (!points.length || !series.length) {
    return <p className="py-10 text-center text-sm text-gray-600">{emptyText}</p>;
  }
  const w = 640;
  const h = height;
  const pad = { t: 18, r: 14, b: 28, l: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxV = Math.max(
    1,
    ...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0))
  );
  const x = (i: number) =>
    pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / maxV) * innerH;

  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(maxV * t)))];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const last = points[points.length - 1];

  const line = (key: string) =>
    points
      .map(
        (d, i) =>
          `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(Number(d[key]) || 0).toFixed(1)}`
      )
      .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[480px]" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fill={AXIS} fontSize="10">
              {fmtRu(t)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={line(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={s.dash ? "4 3" : undefined}
          />
        ))}
        {points.map((d, i) => (
          <g key={`pt-${d.date}`}>
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(i)}
                cy={y(Number(d[s.key]) || 0)}
                r="2.3"
                fill={s.color}
              >
                <title>
                  {`${d.date.slice(5)} — ${series
                    .map((ss) => `${ss.label}: ${(ss.format || fmtRu)(Number(d[ss.key]) || 0)}`)
                    .join(", ")}`}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {series.map((s) => {
          const mode = s.labels ?? "stride";
          if (mode === "none") return null;
          const fmt = s.format || fmtRu;
          return points.map((d, i) => {
            const show = mode === "last" ? i === points.length - 1 : i % labelEvery === 0 || i === points.length - 1;
            if (!show) return null;
            const v = Number(d[s.key]) || 0;
            const above = s.labelPos !== "below";
            const ly = above ? y(v) - 7 : y(v) + 13;
            if (!above && ly > h - 16) return null;
            return (
              <text
                key={`lb-${s.key}-${d.date}`}
                x={x(i)}
                y={ly}
                textAnchor="middle"
                fill={s.color}
                fontSize="8.5"
              >
                {fmt(v)}
              </text>
            );
          });
        })}
        {points.map((d, i) =>
          i % Math.ceil(points.length / 8) === 0 || i === points.length - 1 ? (
            <text
              key={`dt-${d.date}`}
              x={x(i)}
              y={h - 8}
              textAnchor="middle"
              fill={AXIS}
              fontSize="9"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        {series.map((s) => {
          const fmt = s.format || fmtRu;
          const total = points.reduce((sum, p) => sum + (Number(p[s.key]) || 0), 0);
          return (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  background: s.dash ? "transparent" : s.color,
                  borderTop: s.dash ? `2px dashed ${s.color}` : undefined,
                }}
              />
              {s.label}: <span className="text-gray-300">{fmt(total)}</span>
              {" "}· {last.date.slice(5)}:{" "}
              <span className="text-gray-300">{fmt(Number(last[s.key]) || 0)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Funnel -------------------------------- */

export type FunnelStepRow = {
  key: string;
  label: string;
  value: number;
  cr: number | null;
  worst?: boolean;
  sampleSmall?: boolean;
};

export function FunnelChart({ steps }: { steps: FunnelStepRow[] }) {
  if (!steps.length) {
    return <p className="py-6 text-center text-sm text-gray-600">Пока нет данных воронки</p>;
  }
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <div className="space-y-1">
      {steps.map((s, i) => {
        const pctOfTop = Math.max(0.5, (s.value / top) * 100);
        return (
          <div key={s.key}>
            {i > 0 ? (
              <div
                className="flex items-center gap-2 py-0.5 text-[10px] text-gray-500"
                style={{ paddingLeft: 138 }}
              >
                <span aria-hidden>↓</span>
                <span className={s.worst ? "font-semibold text-amber-400" : ""}>
                  CR {s.cr != null ? `${(s.cr * 100).toFixed(1)}%` : "—"}
                  {s.worst ? " · худший переход" : ""}
                  {s.sampleSmall ? " · выборка мала" : ""}
                </span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 truncate text-right text-xs text-gray-400"
                style={{ width: 130 }}
                title={s.label}
              >
                {s.label}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                <div
                  className="flex h-full items-center rounded pl-2"
                  style={{
                    width: `${pctOfTop}%`,
                    minWidth: "fit-content",
                    background: s.worst
                      ? "rgba(251,191,36,0.35)"
                      : `rgba(212,175,55,${0.75 - i * 0.07})`,
                  }}
                >
                  <span className="whitespace-nowrap text-[11px] font-medium text-amber-50">
                    {fmtRu(s.value)}
                  </span>
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-[10px] text-gray-500">
                {((s.value / top) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- Spend (bar+line) -------------------------- */

export type SpendPoint = {
  date: string;
  costRub: number;
  clicks: number;
  impressions?: number;
  revenueRub?: number | null;
};

export function SpendChart({
  points,
  height = 190,
}: {
  points: SpendPoint[];
  height?: number;
}) {
  if (!points.length) {
    return <p className="py-10 text-center text-sm text-gray-600">Нет статистики Директа за период</p>;
  }
  const w = 640;
  const h = height;
  const hasRevenue = points.some((p) => (p.revenueRub ?? 0) > 0);
  const pad = { t: 18, r: 40, b: 28, l: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxCost = Math.max(1, ...points.map((p) => Math.max(p.costRub, p.revenueRub ?? 0)));
  const maxClicks = Math.max(1, ...points.map((p) => p.clicks));
  const slot = innerW / points.length;
  const barW = Math.max(3, Math.min(26, slot * 0.55));
  const cx = (i: number) => pad.l + slot * (points.length <= 1 ? 0.5 : i + 0.5);
  const yCost = (v: number) => pad.t + innerH - (v / maxCost) * innerH;
  const yClk = (v: number) => pad.t + innerH - (v / maxClicks) * innerH;

  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(maxCost * t)))];
  const clickTicks = [...new Set([0, 0.5, 1].map((t) => Math.round(maxClicks * t)))];
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const last = points[points.length - 1];

  const totalCost = points.reduce((s, p) => s + p.costRub, 0);
  const totalClicks = points.reduce((s, p) => s + p.clicks, 0);
  const totalImpr = points.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalRevenue = points.reduce((s, p) => s + (p.revenueRub ?? 0), 0);
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : null;
  const avgCtr = totalImpr > 0 ? totalClicks / totalImpr : null;

  const clickLine = points
    .map((d, i) => `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${yClk(d.clicks).toFixed(1)}`)
    .join(" ");
  const revenueLine = hasRevenue
    ? points
        .map(
          (d, i) =>
            `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${yCost(d.revenueRub ?? 0).toFixed(1)}`
        )
        .join(" ")
    : "";

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[480px]" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={yCost(t)} y2={yCost(t)} stroke={GRID} />
            <text x={pad.l - 6} y={yCost(t) + 3} textAnchor="end" fill={AXIS} fontSize="10">
              {fmtRu(t)}₽
            </text>
          </g>
        ))}
        {clickTicks.map((t) => (
          <text
            key={`ct-${t}`}
            x={w - pad.r + 6}
            y={yClk(t) + 3}
            textAnchor="start"
            fill="rgba(52,211,153,0.55)"
            fontSize="9"
          >
            {fmtRu(t)}
          </text>
        ))}
        {points.map((d, i) => (
          <rect
            key={`bar-${d.date}`}
            x={cx(i) - barW / 2}
            y={yCost(d.costRub)}
            width={barW}
            height={Math.max(0, pad.t + innerH - yCost(d.costRub))}
            rx="1.5"
            fill="rgba(212,175,55,0.45)"
          >
            <title>{`${d.date.slice(5)} — расход: ${fmtRu(d.costRub)} ₽, клики: ${fmtRu(d.clicks)}`}</title>
          </rect>
        ))}
        {hasRevenue ? (
          <path d={revenueLine} fill="none" stroke="rgba(240,230,200,0.9)" strokeWidth="2" />
        ) : null}
        <path d={clickLine} fill="none" stroke={EMERALD} strokeWidth="2" />
        {points.map((d, i) => (
          <g key={`pt-${d.date}`}>
            <circle cx={cx(i)} cy={yClk(d.clicks)} r="2.3" fill={EMERALD}>
              <title>{`${d.date.slice(5)} — клики: ${fmtRu(d.clicks)}, расход: ${fmtRu(d.costRub)} ₽`}</title>
            </circle>
            {hasRevenue ? (
              <circle cx={cx(i)} cy={yCost(d.revenueRub ?? 0)} r="2.3" fill="rgba(240,230,200,0.9)">
                <title>{`${d.date.slice(5)} — выручка: ${fmtRu(d.revenueRub ?? 0)} ₽`}</title>
              </circle>
            ) : null}
          </g>
        ))}
        {points.map((d, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={`cl-${d.date}`}
              x={cx(i)}
              y={yCost(d.costRub) - 5}
              textAnchor="middle"
              fill="rgba(254,243,199,0.85)"
              fontSize="8.5"
            >
              {fmtRu(d.costRub)}
            </text>
          ) : null
        )}
        {points.map((d, i) =>
          i % Math.ceil(points.length / 8) === 0 || i === points.length - 1 ? (
            <text
              key={`dt-${d.date}`}
              x={cx(i)}
              y={h - 8}
              textAnchor="middle"
              fill={AXIS}
              fontSize="9"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "rgba(212,175,55,0.45)" }} />
          Расход: <span className="text-gray-300">{fmtRu(totalCost)} ₽</span>
          {" "}· {last.date.slice(5)}: <span className="text-gray-300">{fmtRu(last.costRub)} ₽</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: EMERALD }} />
          Клики: <span className="text-gray-300">{fmtRu(totalClicks)}</span>
          {" "}· {last.date.slice(5)}: <span className="text-gray-300">{fmtRu(last.clicks)}</span>
        </span>
        {hasRevenue ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: "rgba(240,230,200,0.9)" }} />
            Выручка: <span className="text-gray-300">{fmtRu(totalRevenue)} ₽</span>
          </span>
        ) : null}
        {avgCpc != null ? <span>ср. CPC {avgCpc.toFixed(1)} ₽</span> : null}
        {avgCtr != null ? <span>ср. CTR {(avgCtr * 100).toFixed(1)}%</span> : null}
      </div>
    </div>
  );
}

/* ----------------------------- Positions ------------------------------- */

export function PositionChart({
  points,
  height = 150,
}: {
  points: { date: string; position: number | null }[];
  height?: number;
}) {
  const pts = points.filter((p) => p.position != null && p.position > 0);
  if (!pts.length) {
    return <p className="py-6 text-center text-sm text-gray-600">Нет истории позиций</p>;
  }
  const w = 640;
  const h = height;
  const pad = { t: 16, r: 14, b: 24, l: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  // Y axis is inverted: position 1 (best) at the top.
  const maxPos = Math.max(10, Math.ceil(Math.max(...pts.map((p) => p.position as number))));
  const x = (i: number) =>
    pad.l + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (pos: number) => pad.t + ((pos - 1) / (maxPos - 1)) * innerH;

  const ticks = [...new Set([1, Math.round(maxPos / 2), maxPos])];
  const labelEvery = Math.max(1, Math.ceil(pts.length / 8));
  const last = pts[pts.length - 1];
  const best = Math.min(...pts.map((p) => p.position as number));
  const avg = pts.reduce((s, p) => s + (p.position as number), 0) / pts.length;

  const line = pts
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.position as number).toFixed(1)}`
    )
    .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full min-w-[400px]" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fill={AXIS} fontSize="10">
              {t}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke={GOLD} strokeWidth="2" />
        {pts.map((d, i) => (
          <circle key={`pt-${d.date}`} cx={x(i)} cy={y(d.position as number)} r="2.4" fill={GOLD}>
            <title>{`${d.date.slice(5)} — позиция: ${(d.position as number).toFixed(1)}`}</title>
          </circle>
        ))}
        {pts.map((d, i) =>
          pts.length <= 10 || i % labelEvery === 0 || i === pts.length - 1 ? (
            <text
              key={`lb-${d.date}`}
              x={x(i)}
              y={y(d.position as number) - 6}
              textAnchor="middle"
              fill="rgba(254,243,199,0.85)"
              fontSize="8.5"
            >
              {(d.position as number).toFixed(0)}
            </text>
          ) : null
        )}
        {pts.map((d, i) =>
          i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1 ? (
            <text
              key={`dt-${d.date}`}
              x={x(i)}
              y={h - 6}
              textAnchor="middle"
              fill={AXIS}
              fontSize="9"
            >
              {d.date.slice(5)}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: GOLD }} />
          Позиция · {last.date.slice(5)}:{" "}
          <span className="text-gray-300">{(last.position as number).toFixed(1)}</span>
        </span>
        <span>лучшая {best.toFixed(0)}</span>
        <span>средняя {avg.toFixed(1)}</span>
      </div>
    </div>
  );
}
