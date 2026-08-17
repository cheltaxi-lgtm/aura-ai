import type { HdChart, HdPublicChart } from "@/lib/human-design";
import {
  HD_CENTER_LABELS,
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
} from "./bodygraph-geometry";

/**
 * Server-safe static bodygraph (no hooks, no interactivity): share cards and
 * print/PDF reports. `idPrefix` must be unique per rendered instance on the
 * page — gradient ids are derived from it (two cards sharing an id would both
 * paint from the first defs block).
 */

type GateActivity = { pLine?: number; dLine?: number };

function buildGateActivity(chart: HdChart | HdPublicChart): Map<number, GateActivity> {
  const map = new Map<number, GateActivity>();
  for (const a of chart.personality) {
    const entry = map.get(a.gate) ?? {};
    entry.pLine = a.line;
    map.set(a.gate, entry);
  }
  for (const a of chart.designActivations) {
    const entry = map.get(a.gate) ?? {};
    entry.dLine = a.line;
    map.set(a.gate, entry);
  }
  return map;
}

interface Palette {
  p: string;
  d: string;
  channelBase: string;
  centerOpenFill: string;
  centerOpenStroke: string;
  centerDefinedStroke: string;
  centerLabel: string;
  centerLabelOnDefined: string;
  gateNumber: string;
  gateRingStroke: string;
  medallionText: string;
}

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    p: "#f2e7c9",
    d: "#e05555",
    channelBase: "rgba(232, 199, 126, 0.14)",
    centerOpenFill: "#141210",
    centerOpenStroke: "rgba(232, 199, 126, 0.35)",
    centerDefinedStroke: "rgba(255, 232, 168, 0.9)",
    centerLabel: "rgba(232, 199, 126, 0.55)",
    centerLabelOnDefined: "rgba(23, 19, 31, 0.75)",
    gateNumber: "rgba(232, 199, 126, 0.45)",
    gateRingStroke: "rgba(232, 199, 126, 0.38)",
    medallionText: "#17131f",
  },
  light: {
    p: "#2b2418",
    d: "#b03030",
    channelBase: "rgba(43, 36, 24, 0.14)",
    centerOpenFill: "#ffffff",
    centerOpenStroke: "rgba(43, 36, 24, 0.30)",
    centerDefinedStroke: "#8a6a2a",
    centerLabel: "rgba(43, 36, 24, 0.55)",
    centerLabelOnDefined: "rgba(43, 36, 24, 0.72)",
    gateNumber: "rgba(43, 36, 24, 0.40)",
    gateRingStroke: "rgba(43, 36, 24, 0.35)",
    medallionText: "#ffffff",
  },
};

export default function HdStaticBodygraph({
  chart,
  theme = "dark",
  idPrefix,
  className,
  showLabels = true,
}: {
  chart: HdChart | HdPublicChart;
  theme?: "dark" | "light";
  idPrefix: string;
  className?: string;
  /** Center name captions; off only if a caller embeds the graph at tiny size. */
  showLabels?: boolean;
}) {
  const pal = PALETTES[theme];
  const gradDefined = `${idPrefix}-center`;
  const gateActivity = buildGateActivity(chart);
  const definedCenters = new Set(chart.definedCenters);
  const definedChannels = new Set(
    chart.channels.filter((c) => c.defined).map((c) => c.key)
  );

  return (
    <svg viewBox="0 0 400 700" className={className} role="img" aria-label="Бодиграф">
      <defs>
        <linearGradient id={gradDefined} x1="0" y1="0" x2="1" y2="1">
          {theme === "dark" ? (
            <>
              <stop offset="0%" stopColor="#e8c77e" />
              <stop offset="100%" stopColor="#a8843a" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#f0dfae" />
              <stop offset="100%" stopColor="#d9bc72" />
            </>
          )}
        </linearGradient>
      </defs>

      <g strokeLinecap="round">
        {HD_CHANNEL_SEGMENTS.map((seg) => {
          const a = gateActivity.get(seg.gates[0]);
          const b = gateActivity.get(seg.gates[1]);
          const defined = definedChannels.has(seg.key);
          const half = (
            act: GateActivity | undefined,
            x1: number,
            y1: number,
            x2: number,
            y2: number
          ) => {
            const both = Boolean(act?.pLine && act?.dLine);
            if (both) {
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const nx = (-dy / len) * 1.7;
              const ny = (dx / len) * 1.7;
              return (
                <g key={`${x1}-${y1}`}>
                  <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny}
                    stroke={pal.p} strokeWidth={defined ? 2.4 : 2} />
                  <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny}
                    stroke={pal.d} strokeWidth={defined ? 2.4 : 2} />
                </g>
              );
            }
            const color = !act
              ? pal.channelBase
              : act.dLine && !act.pLine
                ? pal.d
                : pal.p;
            return (
              <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={color} strokeWidth={defined ? 5 : 3} />
            );
          };
          return (
            <g key={seg.key}>
              {half(a, seg.ax, seg.ay, seg.mx, seg.my)}
              {half(b, seg.mx, seg.my, seg.bx, seg.by)}
            </g>
          );
        })}
      </g>

      <g>
        {Object.values(HD_CENTER_SHAPES).map((shape) => {
          const defined = definedCenters.has(shape.key);
          return (
            <path
              key={shape.key}
              d={shape.path}
              fill={defined ? `url(#${gradDefined})` : pal.centerOpenFill}
              stroke={defined ? pal.centerDefinedStroke : pal.centerOpenStroke}
              strokeWidth={defined ? 2 : 1.5}
            />
          );
        })}
      </g>

      {showLabels && (
        <g
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
          fontSize={9}
          fontWeight={600}
          letterSpacing="0.1em"
        >
          {HD_CENTER_LABELS.map((l) => (
            <text
              key={l.key}
              x={l.x}
              y={l.y}
              transform={l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined}
              fill={
                l.inside && definedCenters.has(l.key)
                  ? pal.centerLabelOnDefined
                  : pal.centerLabel
              }
            >
              {l.text.toUpperCase()}
            </text>
          ))}
        </g>
      )}

      <g fontFamily="system-ui, sans-serif" textAnchor="middle">
        {HD_GATE_ANCHORS.map((anchor) => {
          const a = gateActivity.get(anchor.gate);
          const active = Boolean(a);
          const both = Boolean(a?.pLine && a?.dLine);
          return (
            <g key={anchor.gate}>
              {active ? (
                both ? (
                  <>
                    <path
                      d={`M${anchor.lx} ${anchor.ly - 9} A9 9 0 0 1 ${anchor.lx} ${anchor.ly + 9} Z`}
                      fill={pal.p}
                    />
                    <path
                      d={`M${anchor.lx} ${anchor.ly - 9} A9 9 0 0 0 ${anchor.lx} ${anchor.ly + 9} Z`}
                      fill={pal.d}
                    />
                  </>
                ) : (
                  <circle
                    cx={anchor.lx}
                    cy={anchor.ly}
                    r={9}
                    fill={a?.dLine && !a?.pLine ? pal.d : pal.p}
                  />
                )
              ) : (
                <circle
                  cx={anchor.lx}
                  cy={anchor.ly}
                  r={9}
                  fill={pal.centerOpenFill}
                  stroke={pal.gateRingStroke}
                  strokeWidth={1.2}
                />
              )}
              <text
                x={anchor.lx}
                y={anchor.ly + (active ? 3 : 2.5)}
                fontSize={active ? 9 : 7.5}
                fontWeight={active ? 700 : 400}
                fill={active ? pal.medallionText : pal.gateNumber}
              >
                {anchor.gate}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
