"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HdCenterKey, HdChart } from "@/lib/human-design";
import {
  CENTER_NAMES_RU,
  CHANNELS,
  GATE_NAMES_RU,
} from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
} from "./bodygraph-geometry";

const COLOR_P = "#f2e7c9";
const COLOR_D = "#e05555";
const COLOR_BASE = "rgba(232, 199, 126, 0.10)";

type GateActivity = { pLine?: number; dLine?: number };
type LayerFilter = "all" | "p" | "d";

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function buildGateActivity(chart: HdChart): Map<number, GateActivity> {
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

function halfColor(active: boolean, source: "p" | "d" | undefined): string {
  if (!active) return COLOR_BASE;
  return source === "d" ? COLOR_D : COLOR_P;
}

/** Whether a half-channel segment is visible under the current layer filter. */
function layerVisible(source: "p" | "d" | undefined, filter: LayerFilter): boolean {
  if (!source) return true; // inactive segments always show as base
  if (filter === "all") return true;
  return source === filter;
}

export default function Bodygraph({ chart }: { chart: HdChart }) {
  const reduceMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [layer, setLayer] = useState<LayerFilter>("all");
  const [highlightCenter, setHighlightCenter] = useState<HdCenterKey | null>(null);

  const gateActivity = useMemo(() => buildGateActivity(chart), [chart]);
  const definedCenters = useMemo(() => new Set(chart.definedCenters), [chart]);
  const definedChannels = useMemo(
    () => new Set(chart.channels.filter((c) => c.defined).map((c) => c.key)),
    [chart]
  );

  const channelName = useCallback((key: string) => {
    const def = CHANNELS.find((c) => `${c.gates[0]}-${c.gates[1]}` === key);
    return def?.nameRu ?? key;
  }, []);

  const showGateTooltip = useCallback(
    (gate: number, lx: number, ly: number) => {
      const activity = gateActivity.get(gate);
      const lines: string[] = [];
      if (activity?.pLine) lines.push(`Личность: линия ${activity.pLine}`);
      if (activity?.dLine) lines.push(`Дизайн: линия ${activity.dLine}`);
      if (!lines.length) lines.push("Ворота не активированы");
      setTooltip({
        x: lx,
        y: ly,
        title: `Ворота ${gate} — ${GATE_NAMES_RU[gate] ?? ""}`,
        lines,
      });
    },
    [gateActivity]
  );

  const showCenterTooltip = useCallback(
    (center: HdCenterKey, cx: number, cy: number) => {
      const defined = definedCenters.has(center);
      setTooltip({
        x: cx,
        y: cy,
        title: CENTER_NAMES_RU[center],
        lines: [
          defined
            ? "Определённый центр — стабильная, надёжная энергия"
            : "Открытый центр — гибкость и чувствительность к чужому влиянию",
        ],
      });
    },
    [definedCenters]
  );

  const exportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = 400 * scale;
      canvas.height = 700 * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#0c0a14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) return;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(png);
        link.download = "dizayn-cheloveka-bodigraf.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 5_000);
      }, "image/png");
    };
    img.src = url;
  }, []);

  const centerOrder: HdCenterKey[] = [
    "head", "ajna", "throat", "g", "heart", "spleen", "solar", "sacral", "root",
  ];

  return (
    <div className="hd-bodygraph">
      <div className="hd-bodygraph__stage" onMouseLeave={() => setTooltip(null)}>
        <svg
          ref={svgRef}
          viewBox="0 0 400 700"
          role="img"
          aria-label={`Бодиграф: ${chart.activeGates.length} активных ворот, ${chart.definedCenters.length} определённых центров`}
          className="hd-bodygraph__svg"
        >
          <defs>
            <linearGradient id="hd-center-defined" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e8c77e" />
              <stop offset="100%" stopColor="#a8843a" />
            </linearGradient>
            <radialGradient id="hd-center-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="rgba(232, 199, 126, 0.55)" />
              <stop offset="100%" stopColor="rgba(232, 199, 126, 0)" />
            </radialGradient>
            <filter id="hd-soft-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ambient orbital rings */}
          <g aria-hidden="true" opacity={0.5}>
            <circle cx={200} cy={348} r={172} fill="none" stroke="rgba(155,127,212,0.10)" strokeWidth={1} strokeDasharray="2 7" />
            <circle cx={200} cy={348} r={232} fill="none" stroke="rgba(232,199,126,0.07)" strokeWidth={1} strokeDasharray="1 9" />
          </g>

          {/* Channels */}
          <g strokeLinecap="round">
            {HD_CHANNEL_SEGMENTS.map((seg, i) => {
              const aAct = gateActivity.get(seg.gates[0]);
              const bAct = gateActivity.get(seg.gates[1]);
              const aSource = aAct?.pLine ? "p" : aAct?.dLine ? "d" : undefined;
              const bSource = bAct?.pLine ? "p" : bAct?.dLine ? "d" : undefined;
              const defined = definedChannels.has(seg.key);
              const aVisible = layerVisible(aSource, layer);
              const bVisible = layerVisible(bSource, layer);
              return (
                <motion.g
                  key={seg.key}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: reduceMotion ? 0 : i * 0.02 }}
                >
                  {defined && (
                    <line
                      x1={seg.ax} y1={seg.ay} x2={seg.bx} y2={seg.by}
                      stroke="rgba(232,199,126,0.35)"
                      strokeWidth={9}
                      filter="url(#hd-soft-glow)"
                      opacity={aVisible && bVisible ? 0.8 : 0.15}
                    />
                  )}
                  <line
                    x1={seg.ax} y1={seg.ay} x2={seg.mx} y2={seg.my}
                    stroke={aVisible ? halfColor(Boolean(aAct), aSource) : COLOR_BASE}
                    strokeWidth={defined ? 5 : 3}
                    opacity={aVisible ? 1 : 0.25}
                  />
                  <line
                    x1={seg.mx} y1={seg.my} x2={seg.bx} y2={seg.by}
                    stroke={bVisible ? halfColor(Boolean(bAct), bSource) : COLOR_BASE}
                    strokeWidth={defined ? 5 : 3}
                    opacity={bVisible ? 1 : 0.25}
                  />
                  <line
                    x1={seg.ax} y1={seg.ay} x2={seg.bx} y2={seg.by}
                    stroke="transparent"
                    strokeWidth={14}
                    onMouseEnter={() =>
                      setTooltip({
                        x: seg.mx,
                        y: seg.my,
                        title: `Канал ${seg.key} — ${channelName(seg.key)}`,
                        lines: [
                          defined
                            ? "Определённый канал — постоянная сила"
                            : "Канал не определён (висячие ворота)",
                        ],
                      })
                    }
                    onClick={() =>
                      setTooltip({
                        x: seg.mx,
                        y: seg.my,
                        title: `Канал ${seg.key} — ${channelName(seg.key)}`,
                        lines: [
                          defined
                            ? "Определённый канал — постоянная сила"
                            : "Канал не определён (висячие ворота)",
                        ],
                      })
                    }
                  />
                </motion.g>
              );
            })}
          </g>

          {/* Centers */}
          <g>
            {Object.values(HD_CENTER_SHAPES).map((shape, i) => {
              const defined = definedCenters.has(shape.key);
              const dimmed = highlightCenter !== null && highlightCenter !== shape.key;
              return (
                <motion.g
                  key={shape.key}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: dimmed ? 0.25 : 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.3 + i * 0.06 }}
                  style={{ transformOrigin: `${shape.cx}px ${shape.cy}px` }}
                >
                  {defined && (
                    <circle
                      cx={shape.cx}
                      cy={shape.cy}
                      r={52}
                      fill="url(#hd-center-glow)"
                      aria-hidden="true"
                    />
                  )}
                  <path
                    d={shape.path}
                    fill={defined ? "url(#hd-center-defined)" : "rgba(255,255,255,0.03)"}
                    stroke={defined ? "rgba(255, 232, 168, 0.9)" : "rgba(232, 199, 126, 0.35)"}
                    strokeWidth={defined ? 2 : 1.5}
                    filter={defined ? "url(#hd-soft-glow)" : undefined}
                    onMouseEnter={() => showCenterTooltip(shape.key, shape.cx, shape.cy)}
                    onClick={() => showCenterTooltip(shape.key, shape.cx, shape.cy)}
                  />
                  <text
                    x={shape.cx}
                    y={shape.cy + 3}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill={defined ? "#17131f" : "rgba(232,199,126,0.55)"}
                    style={{ pointerEvents: "none", letterSpacing: "0.04em" }}
                  >
                    {CENTER_NAMES_RU[shape.key]}
                  </text>
                </motion.g>
              );
            })}
          </g>

          {/* Gate labels */}
          <g fontFamily="system-ui, sans-serif" fontSize={9} textAnchor="middle">
            {HD_GATE_ANCHORS.map((anchor) => {
              const a = gateActivity.get(anchor.gate);
              const active = Boolean(a);
              const source = a?.pLine ? "p" : a?.dLine ? "d" : undefined;
              const visible = layerVisible(source, layer);
              return (
                <g
                  key={anchor.gate}
                  onMouseEnter={() => showGateTooltip(anchor.gate, anchor.lx, anchor.ly)}
                  onClick={() => showGateTooltip(anchor.gate, anchor.lx, anchor.ly)}
                  className="hd-bodygraph__gate"
                  opacity={visible ? 1 : 0.2}
                >
                  <circle
                    cx={anchor.lx}
                    cy={anchor.ly}
                    r={8}
                    fill={active ? (a?.dLine && !a?.pLine ? COLOR_D : COLOR_P) : "#17131f"}
                    stroke={active ? "rgba(255,255,255,0.5)" : "rgba(232,199,126,0.3)"}
                    strokeWidth={1}
                  />
                  <text
                    x={anchor.lx}
                    y={anchor.ly + 3}
                    fill={active ? "#17131f" : "rgba(232,199,126,0.75)"}
                    fontWeight={active ? 700 : 400}
                  >
                    {anchor.gate}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {tooltip && (
          <div
            className="hd-bodygraph__tooltip"
            style={{
              left: `${(tooltip.x / 400) * 100}%`,
              top: `${(tooltip.y / 700) * 100}%`,
            }}
            role="status"
          >
            <p className="hd-bodygraph__tooltip-title">{tooltip.title}</p>
            {tooltip.lines.map((line) => (
              <p key={line} className="hd-bodygraph__tooltip-line">{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Layer filter */}
      <div className="hd-bodygraph__layers" role="group" aria-label="Фильтр активаций">
        {(
          [
            ["all", "Вся карта"],
            ["p", "Личность"],
            ["d", "Дизайн"],
          ] as [LayerFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setLayer(key)}
            className={`hd-bodygraph__layer-btn${layer === key ? " is-active" : ""}`}
          >
            {key !== "all" && (
              <i style={{ background: key === "p" ? COLOR_P : COLOR_D }} />
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Interactive centers legend */}
      <div className="hd-bodygraph__centers-legend">
        {centerOrder.map((key) => {
          const defined = definedCenters.has(key);
          const active = highlightCenter === key;
          return (
            <button
              key={key}
              type="button"
              onMouseEnter={() => setHighlightCenter(key)}
              onMouseLeave={() => setHighlightCenter(null)}
              onClick={() => setHighlightCenter(active ? null : key)}
              className={`hd-bodygraph__center-chip${defined ? " is-defined" : ""}${active ? " is-active" : ""}`}
            >
              {CENTER_NAMES_RU[key]}
            </button>
          );
        })}
      </div>

      <div className="hd-bodygraph__legend">
        <span className="hd-bodygraph__legend-item">
          <i style={{ background: COLOR_P }} /> Личность (сознательное)
        </span>
        <span className="hd-bodygraph__legend-item">
          <i style={{ background: COLOR_D }} /> Дизайн (бессознательное)
        </span>
        <span className="hd-bodygraph__legend-item">
          <i className="hd-bodygraph__legend-swatch" /> Определённый центр
        </span>
        <button type="button" onClick={exportPng} className="hd-bodygraph__export">
          Скачать PNG
        </button>
      </div>
    </div>
  );
}
