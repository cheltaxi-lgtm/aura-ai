"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "framer-motion";
import type { HdBodyKey, HdCenterKey, HdChart } from "@/lib/human-design";
import {
  CENTER_NAMES_RU,
  CHANNELS,
  GATE_NAMES_RU,
} from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
  gateAnchor,
} from "./bodygraph-geometry";
import HdCosmos from "./HdCosmos";

const COLOR_P = "#f2e7c9";
const COLOR_D = "#e05555";
const COLOR_BASE = "rgba(232, 199, 126, 0.10)";

const BODY_GLYPH: Record<HdBodyKey, string> = {
  sun: "☉", earth: "⊕", moon: "☽", northNode: "☊", southNode: "☋",
  mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄",
  uranus: "♅", neptune: "♆", pluto: "♇",
};

const BODY_NAMES_RU: Record<HdBodyKey, string> = {
  sun: "Солнце", earth: "Земля", moon: "Луна",
  northNode: "Северный узел", southNode: "Южный узел",
  mercury: "Меркурий", venus: "Венера", mars: "Марс",
  jupiter: "Юпитер", saturn: "Сатурн", uranus: "Уран",
  neptune: "Нептун", pluto: "Плутон",
};

const BODY_ORDER: HdBodyKey[] = [
  "sun", "earth", "moon", "northNode", "southNode",
  "mercury", "venus", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto",
];

type GateActivity = { pLine?: number; dLine?: number; pBody?: HdBodyKey; dBody?: HdBodyKey };
type LayerFilter = "all" | "p" | "d";

interface TooltipState {
  /** Anchor point in % of the stage box (zoom/tilt independent). */
  x: number;
  y: number;
  /** Flip horizontally when the anchor hugs a side edge. */
  flipX: "left" | "right" | null;
  /** Show below the anchor when it hugs the top edge. */
  flipY: boolean;
  title: string;
  lines: string[];
  action?: { label: string; run: () => void };
}

function buildGateActivity(chart: HdChart): Map<number, GateActivity> {
  const map = new Map<number, GateActivity>();
  for (const a of chart.personality) {
    const entry = map.get(a.gate) ?? {};
    entry.pLine = a.line;
    entry.pBody = a.body;
    map.set(a.gate, entry);
  }
  for (const a of chart.designActivations) {
    const entry = map.get(a.gate) ?? {};
    entry.dLine = a.line;
    entry.dBody = a.body;
    map.set(a.gate, entry);
  }
  return map;
}

function halfColor(active: boolean, source: "p" | "d" | undefined): string {
  if (!active) return COLOR_BASE;
  return source === "d" ? COLOR_D : COLOR_P;
}

function layerVisible(source: "p" | "d" | undefined, filter: LayerFilter): boolean {
  if (!source) return true;
  if (filter === "all") return true;
  return source === filter;
}

/** Channels that touch the given center (via either gate's anchor). */
function channelsForCenter(center: HdCenterKey): Set<string> {
  const keys = new Set<string>();
  for (const seg of HD_CHANNEL_SEGMENTS) {
    if (gateAnchor(seg.gates[0]).center === center || gateAnchor(seg.gates[1]).center === center) {
      keys.add(seg.key);
    }
  }
  return keys;
}

function formatDesignDate(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export interface BodygraphProps {
  chart: HdChart;
  /** gate → transiting body, for the live-transit overlay. */
  transits?: Map<number, HdBodyKey> | null;
  /** Channels completed only by combining two charts (composite). */
  electromagneticChannels?: Set<string> | null;
  /** Gates activated only by the partner in composite mode. */
  partnerGates?: Set<number> | null;
  /** Ask Evelina about a center (paid). */
  onCenterInsight?: (center: HdCenterKey) => void;
}

interface ZoomState {
  k: number;
  x: number;
  y: number;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

export default function Bodygraph({
  chart,
  transits,
  electromagneticChannels,
  partnerGates,
  onCenterInsight,
}: BodygraphProps) {
  const reduceMotion = useReducedMotion();
  // Unique per mount — two bodygraphs on one page must not share gradient ids
  // or the browser paints both SVGs from the first defs block (ghost stacking).
  const uid = useId().replace(/:/g, "");
  const gradDefined = `hd-center-defined-${uid}`;
  const gradGlow = `hd-center-glow-${uid}`;
  const filterGlow = `hd-soft-glow-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [layer, setLayer] = useState<LayerFilter>("all");
  const [highlightCenter, setHighlightCenter] = useState<HdCenterKey | null>(null);
  // Tilt as motion values: mousemove updates the transform without a React
  // rerender of the whole SVG tree.
  const tiltRx = useMotionValue(0);
  const tiltRy = useMotionValue(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState<ZoomState>({ k: 1, x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const dragRef = useRef<{ px: number; py: number; zx: number; zy: number } | null>(null);

  // Chart switch (same component instance / composite remount): drop overlay state.
  const chartEpoch = `${chart.type}:${chart.profile}:${chart.activeGates.join(",")}`;
  useEffect(() => {
    setTooltip(null);
    setLayer("all");
    setHighlightCenter(null);
    setFullscreen(false);
    setZoom({ k: 1, x: 0, y: 0 });
    tiltRx.set(0);
    tiltRy.set(0);
    document.body.style.overflow = "";
  }, [chartEpoch, tiltRx, tiltRy]);

  const clampZoom = useCallback((z: ZoomState): ZoomState => {
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z.k));
    if (k === 1) return { k: 1, x: 0, y: 0 };
    const limit = 140 * (k - 1);
    return {
      k,
      x: Math.min(limit, Math.max(-limit, z.x)),
      y: Math.min(limit * 1.6, Math.max(-limit * 1.6, z.y)),
    };
  }, []);

  const zoomBy = useCallback(
    (delta: number) => setZoom((z) => clampZoom({ ...z, k: z.k + delta })),
    [clampZoom]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      const z = zoomRef.current;
      const next = clampZoom({ ...z, k: z.k + (e.deltaY < 0 ? 0.25 : -0.25) });
      // Only trap the wheel when the zoom actually changes — at k=1 scrolling
      // out must scroll the page, not jack it (the stage is a tall block).
      if (next.k === z.k) return;
      e.preventDefault();
      setTooltip(null); // anchor rect moves under zoom — drop the stale tooltip
      setZoom(next);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [clampZoom]);

  // Escape closes the tooltip (keyboard users otherwise get a stuck one).
  useEffect(() => {
    if (!tooltip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTooltip(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tooltip]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  const onPanStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (zoom.k <= 1) return;
      setTooltip(null); // anchor rect moves under pan — drop the stale tooltip
      dragRef.current = { px: e.clientX, py: e.clientY, zx: zoom.x, zy: zoom.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [zoom]
  );

  const onPanMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      setZoom((z) =>
        clampZoom({ ...z, x: drag.zx + (e.clientX - drag.px), y: drag.zy + (e.clientY - drag.py) })
      );
    },
    [clampZoom]
  );

  const onPanEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  const gateActivity = useMemo(() => buildGateActivity(chart), [chart]);
  const definedCenters = useMemo(() => new Set(chart.definedCenters), [chart]);
  const definedChannels = useMemo(
    () => new Set(chart.channels.filter((c) => c.defined).map((c) => c.key)),
    [chart]
  );
  const highlightChannels = useMemo(
    () => (highlightCenter ? channelsForCenter(highlightCenter) : null),
    [highlightCenter]
  );

  const personalityByBody = useMemo(() => {
    const m = new Map<HdBodyKey, { gate: number; line: number }>();
    for (const a of chart.personality) m.set(a.body, { gate: a.gate, line: a.line });
    return m;
  }, [chart]);

  const designByBody = useMemo(() => {
    const m = new Map<HdBodyKey, { gate: number; line: number }>();
    for (const a of chart.designActivations) m.set(a.body, { gate: a.gate, line: a.line });
    return m;
  }, [chart]);

  const channelName = useCallback((key: string) => {
    const def = CHANNELS.find((c) => `${c.gates[0]}-${c.gates[1]}` === key);
    return def?.nameRu ?? key;
  }, []);

  /**
   * Anchor the tooltip to the hovered/focused element's on-screen rect.
   * getBoundingClientRect already includes zoom/pan/tilt transforms, so the
   * tooltip stays glued to its element at any scale — and can flip inward at
   * the stage edges instead of being clipped by overflow-hidden.
   */
  const showTooltipFor = useCallback(
    (el: Element, data: { title: string; lines: string[]; action?: TooltipState["action"] }) => {
      const stage = stageRef.current;
      if (!stage) return;
      const sr = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x = ((r.left + r.width / 2 - sr.left) / sr.width) * 100;
      const y = ((r.top + r.height / 2 - sr.top) / sr.height) * 100;
      setTooltip({
        x,
        y,
        flipX: x > 62 ? "left" : x < 38 ? "right" : null,
        flipY: y < 22,
        title: data.title,
        lines: data.lines,
        action: data.action,
      });
    },
    []
  );

  const hideTooltip = useCallback((e?: React.FocusEvent | React.MouseEvent) => {
    // Focus moving INTO the tooltip (its action button) must not hide it.
    const next = e?.relatedTarget as Node | null;
    if (next && tooltipRef.current?.contains(next)) return;
    setTooltip(null);
  }, []);

  const gateTooltipData = useCallback(
    (gate: number) => {
      const activity = gateActivity.get(gate);
      const lines: string[] = [];
      if (activity?.pLine) {
        const body = activity.pBody ? ` (${BODY_NAMES_RU[activity.pBody]})` : "";
        lines.push(`Личность: линия ${activity.pLine}${body}`);
      }
      if (activity?.dLine) {
        const body = activity.dBody ? ` (${BODY_NAMES_RU[activity.dBody]})` : "";
        lines.push(`Дизайн: линия ${activity.dLine}${body}`);
      }
      if (!lines.length) lines.push("Ворота не активированы");
      const transitBody = transits?.get(gate);
      if (transitBody) {
        lines.push(`Транзит сейчас: ${BODY_NAMES_RU[transitBody]}`);
      }
      return { title: `Ворота ${gate} — ${GATE_NAMES_RU[gate] ?? ""}`, lines };
    },
    [gateActivity, transits]
  );

  const centerTooltipData = useCallback(
    (center: HdCenterKey) => {
      const defined = definedCenters.has(center);
      return {
        title: CENTER_NAMES_RU[center],
        lines: [
          defined
            ? "Определённый центр — стабильная, надёжная энергия"
            : "Открытый центр — гибкость и чувствительность к чужому влиянию",
        ],
        action: onCenterInsight
          ? { label: "Разбор Эвелины", run: () => onCenterInsight(center) }
          : undefined,
      };
    },
    [definedCenters, onCenterInsight]
  );

  const onTiltMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduceMotion) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      tiltRx.set(-py * 6);
      tiltRy.set(px * 8);
    },
    [reduceMotion, tiltRx, tiltRy]
  );

  const resetTilt = useCallback(() => {
    tiltRx.set(0);
    tiltRy.set(0);
  }, [tiltRx, tiltRy]);

  const exportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onerror = () => URL.revokeObjectURL(url);
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

  const designDate = formatDesignDate(chart.design.utcIso);
  const channelDrawDelay = 0.15;
  const centerIgniteDelay = channelDrawDelay + HD_CHANNEL_SEGMENTS.length * 0.03;

  // Tilt (motion values, no rerender) + zoom (state) on the layout only —
  // the toolbar and tooltip stay flat and readable.
  const layoutTransform = useMotionTemplate`perspective(1200px) rotateX(${tiltRx}deg) rotateY(${tiltRy}deg) scale(${zoom.k}) translate(${zoom.x / zoom.k}px, ${zoom.y / zoom.k}px)`;

  const renderActivationColumn = (side: "p" | "d") => {
    const map = side === "p" ? personalityByBody : designByBody;
    return (
      <div className={`hd-bodygraph__activations hd-bodygraph__activations--${side}`}>
        <p className="hd-bodygraph__activations-title">
          {side === "p" ? "Личность" : "Дизайн"}
        </p>
        {side === "d" && designDate && (
          <p className="hd-bodygraph__activations-date">{designDate}</p>
        )}
        <ul>
          {BODY_ORDER.map((body) => {
            const act = map.get(body);
            return (
              <li key={body} className={act ? "is-active" : ""}>
                <span className="hd-bodygraph__glyph" title={BODY_NAMES_RU[body]}>
                  {BODY_GLYPH[body]}
                </span>
                {side === "p" ? (
                  <>
                    <span className="hd-bodygraph__act-gate">{act ? act.gate : "—"}</span>
                    <span className="hd-bodygraph__act-line">{act ? `.${act.line}` : ""}</span>
                  </>
                ) : (
                  <>
                    <span className="hd-bodygraph__act-line">{act ? `${act.line}.` : ""}</span>
                    <span className="hd-bodygraph__act-gate">{act ? act.gate : "—"}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className={`hd-bodygraph${fullscreen ? " is-fullscreen" : ""}`}>
      <div
        ref={stageRef}
        className={`hd-bodygraph__stage${zoom.k > 1 ? " is-pannable" : ""}`}
        onMouseLeave={() => {
          setTooltip(null);
          resetTilt();
        }}
        onMouseMove={onTiltMove}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
      >
        <HdCosmos />

        {/* Zoom / fullscreen toolbar */}
        <div className="hd-bodygraph__toolbar hd-print-hidden">
          <button type="button" onClick={() => zoomBy(0.5)} aria-label="Приблизить" title="Приблизить">+</button>
          <button type="button" onClick={() => zoomBy(-0.5)} aria-label="Отдалить" title="Отдалить">−</button>
          {zoom.k > 1 && (
            <button type="button" onClick={() => setZoom({ k: 1, x: 0, y: 0 })} aria-label="Сбросить масштаб" title="Сбросить масштаб">⟲</button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Свернуть (Esc)" : "На весь экран"}
            title={fullscreen ? "Свернуть (Esc)" : "На весь экран"}
          >
            {fullscreen ? "✕" : "⛶"}
          </button>
        </div>

        <motion.div
          className="hd-bodygraph__layout"
          style={{ transform: layoutTransform }}
        >
          {renderActivationColumn("d")}

          <svg
            ref={svgRef}
            viewBox="0 0 400 700"
            role="group"
            aria-label={`Бодиграф: ${chart.activeGates.length} активных ворот, ${chart.definedCenters.length} определённых центров`}
            className="hd-bodygraph__svg"
          >
            <defs>
              <linearGradient id={gradDefined} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#e8c77e" />
                <stop offset="100%" stopColor="#a8843a" />
              </linearGradient>
              <radialGradient id={gradGlow} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="rgba(232, 199, 126, 0.55)" />
                <stop offset="100%" stopColor="rgba(232, 199, 126, 0)" />
              </radialGradient>
              <filter id={filterGlow} x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g aria-hidden="true" opacity={0.5}>
              <circle cx={200} cy={348} r={172} fill="none" stroke="rgba(232,199,126,0.10)" strokeWidth={1} strokeDasharray="2 7" />
              <circle cx={200} cy={348} r={232} fill="none" stroke="rgba(232,199,126,0.07)" strokeWidth={1} strokeDasharray="1 9" />
            </g>

            {/* Channels — path-drawing birth animation */}
            <g strokeLinecap="round">
              {HD_CHANNEL_SEGMENTS.map((seg, i) => {
                const aAct = gateActivity.get(seg.gates[0]);
                const bAct = gateActivity.get(seg.gates[1]);
                const aSource = aAct?.pLine ? "p" : aAct?.dLine ? "d" : undefined;
                const bSource = bAct?.pLine ? "p" : bAct?.dLine ? "d" : undefined;
                const defined = definedChannels.has(seg.key);
                const electro = electromagneticChannels?.has(seg.key) ?? false;
                const aVisible = layerVisible(aSource, layer);
                const bVisible = layerVisible(bSource, layer);
                const highlighted = highlightChannels?.has(seg.key) ?? false;
                const dimmed = highlightChannels !== null && !highlighted;
                const delay = reduceMotion ? 0 : channelDrawDelay + i * 0.03;
                return (
                  <g key={seg.key} opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 0.25s" }}>
                    {electro && (
                      <line
                        x1={seg.ax} y1={seg.ay} x2={seg.bx} y2={seg.by}
                        stroke="rgba(106,168,160,0.7)"
                        strokeWidth={11}
                        filter={`url(#${filterGlow})`}
                      />
                    )}
                    {defined && (
                      <line
                        x1={seg.ax} y1={seg.ay} x2={seg.bx} y2={seg.by}
                        stroke="rgba(232,199,126,0.35)"
                        strokeWidth={highlighted ? 12 : 9}
                        filter={`url(#${filterGlow})`}
                        opacity={aVisible && bVisible ? 0.8 : 0.15}
                      />
                    )}
                    <motion.line
                      x1={seg.ax} y1={seg.ay} x2={seg.mx} y2={seg.my}
                      stroke={aVisible ? halfColor(Boolean(aAct), aSource) : COLOR_BASE}
                      strokeWidth={defined ? 5 : 3}
                      opacity={aVisible ? 1 : 0.25}
                      className={aSource === "d" ? "hd-ch-d" : aSource === "p" ? "hd-ch-p" : "hd-ch-base"}
                      initial={reduceMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay, ease: "easeOut" }}
                    />
                    <motion.line
                      x1={seg.mx} y1={seg.my} x2={seg.bx} y2={seg.by}
                      stroke={bVisible ? halfColor(Boolean(bAct), bSource) : COLOR_BASE}
                      strokeWidth={defined ? 5 : 3}
                      opacity={bVisible ? 1 : 0.25}
                      className={bSource === "d" ? "hd-ch-d" : bSource === "p" ? "hd-ch-p" : "hd-ch-base"}
                      initial={reduceMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay, ease: "easeOut" }}
                    />
                    <line
                      x1={seg.ax} y1={seg.ay} x2={seg.bx} y2={seg.by}
                      stroke="transparent"
                      strokeWidth={14}
                      onMouseEnter={(e) =>
                        showTooltipFor(e.currentTarget, {
                          title: `Канал ${seg.key} — ${channelName(seg.key)}`,
                          lines: [
                            defined
                              ? "Определённый канал — постоянная сила"
                              : "Канал не определён (висячие ворота)",
                          ],
                        })
                      }
                      onClick={(e) =>
                        showTooltipFor(e.currentTarget, {
                          title: `Канал ${seg.key} — ${channelName(seg.key)}`,
                          lines: [
                            defined
                              ? "Определённый канал — постоянная сила"
                              : "Канал не определён (висячие ворота)",
                          ],
                        })
                      }
                    />
                  </g>
                );
              })}
            </g>

            {/* Centers — ignite after channels */}
            <g>
              {Object.values(HD_CENTER_SHAPES).map((shape, i) => {
                const defined = definedCenters.has(shape.key);
                const dimmed = highlightCenter !== null && highlightCenter !== shape.key;
                return (
                  <motion.g
                    key={shape.key}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: dimmed ? 0.25 : 1, scale: 1 }}
                    transition={{
                      duration: 0.55,
                      delay: reduceMotion ? 0 : centerIgniteDelay + i * 0.07,
                      ease: "backOut",
                    }}
                    style={{ transformOrigin: `${shape.cx}px ${shape.cy}px` }}
                  >
                    {defined && (
                      <motion.circle
                        cx={shape.cx}
                        cy={shape.cy}
                        r={52}
                        fill={`url(#${gradGlow})`}
                        aria-hidden="true"
                        animate={reduceMotion ? undefined : { opacity: [0.6, 1, 0.6] }}
                        transition={reduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                      />
                    )}
                    <path
                      d={shape.path}
                      fill={defined ? `url(#${gradDefined})` : "rgba(255,255,255,0.03)"}
                      stroke={defined ? "rgba(255, 232, 168, 0.9)" : "rgba(232, 199, 126, 0.35)"}
                      strokeWidth={defined ? 2 : 1.5}
                      filter={defined ? `url(#${filterGlow})` : undefined}
                      tabIndex={0}
                      role="button"
                      aria-label={`${CENTER_NAMES_RU[shape.key]}: ${defined ? "определён" : "открыт"}`}
                      className="hd-bodygraph__center"
                      onMouseEnter={(e) => {
                        showTooltipFor(e.currentTarget, centerTooltipData(shape.key));
                        setHighlightCenter(shape.key);
                      }}
                      onMouseLeave={() => setHighlightCenter(null)}
                      onClick={(e) => showTooltipFor(e.currentTarget, centerTooltipData(shape.key))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          showTooltipFor(e.currentTarget, centerTooltipData(shape.key));
                        }
                      }}
                      onFocus={(e) => {
                        showTooltipFor(e.currentTarget, centerTooltipData(shape.key));
                        setHighlightCenter(shape.key);
                      }}
                      onBlur={(e) => {
                        setHighlightCenter(null);
                        hideTooltip(e);
                      }}
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

            {/* Gate labels with planet glyphs */}
            <g fontFamily="system-ui, sans-serif" fontSize={9} textAnchor="middle">
              {HD_GATE_ANCHORS.map((anchor) => {
                const a = gateActivity.get(anchor.gate);
                const active = Boolean(a);
                const source = a?.pLine ? "p" : a?.dLine ? "d" : undefined;
                const visible = layerVisible(source, layer);
                const glyph = a?.pBody ? BODY_GLYPH[a.pBody] : a?.dBody ? BODY_GLYPH[a.dBody] : null;
                const transitBody = transits?.get(anchor.gate);
                const partnerOnly = !active && (partnerGates?.has(anchor.gate) ?? false);
                const focusable = active || Boolean(transitBody) || partnerOnly;
                return (
                  <g
                    key={anchor.gate}
                    onMouseEnter={(e) => showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate))}
                    onClick={(e) => showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate))}
                    onKeyDown={(e) => {
                      if (focusable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate));
                      }
                    }}
                    onFocus={(e) => showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate))}
                    onBlur={hideTooltip}
                    tabIndex={focusable ? 0 : undefined}
                    role={focusable ? "button" : undefined}
                    aria-label={
                      focusable
                        ? `Ворота ${anchor.gate} — ${GATE_NAMES_RU[anchor.gate] ?? ""}${active ? ", активированы" : ""}`
                        : undefined
                    }
                    className="hd-bodygraph__gate"
                    opacity={visible ? 1 : 0.2}
                  >
                    {transitBody && (
                      <motion.circle
                        cx={anchor.lx}
                        cy={anchor.ly}
                        r={11}
                        fill="none"
                        stroke="rgba(106,168,160,0.95)"
                        strokeWidth={1.5}
                        animate={reduceMotion ? undefined : { r: [10, 13, 10], opacity: [0.9, 0.4, 0.9] }}
                        transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    <circle
                      cx={anchor.lx}
                      cy={anchor.ly}
                      r={8}
                      fill={
                        active
                          ? (a?.dLine && !a?.pLine ? COLOR_D : COLOR_P)
                          : partnerOnly
                            ? "#6aa8a0"
                            : "#17131f"
                      }
                      stroke={active || partnerOnly ? "rgba(255,255,255,0.5)" : "rgba(232,199,126,0.3)"}
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
                    {glyph && (
                      <text
                        x={anchor.lx}
                        y={anchor.ly - 11}
                        fontSize={8}
                        fill={a?.pBody ? COLOR_P : COLOR_D}
                        opacity={0.9}
                      >
                        {glyph}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {renderActivationColumn("p")}
        </motion.div>

        {tooltip && (
          <div
            ref={tooltipRef}
            className={`hd-bodygraph__tooltip${tooltip.action ? " has-action" : ""}`}
            onBlur={(e) => {
              // Focus leaving the tooltip entirely (not into another child) closes it.
              const next = e.relatedTarget as Node | null;
              if (next && tooltipRef.current?.contains(next)) return;
              setTooltip(null);
            }}
            style={{
              left: `${tooltip.x}%`,
              top: `${tooltip.y}%`,
              transform: `translate(${
                tooltip.flipX === "left"
                  ? "calc(-100% + 14px)"
                  : tooltip.flipX === "right"
                    ? "-14px"
                    : "-50%"
              }, ${tooltip.flipY ? "14px" : "calc(-100% - 10px)"})`,
            }}
            role="status"
          >
            <p className="hd-bodygraph__tooltip-title">{tooltip.title}</p>
            {tooltip.lines.map((line) => (
              <p key={line} className="hd-bodygraph__tooltip-line">{line}</p>
            ))}
            {tooltip.action && (
              <button
                type="button"
                className="hd-bodygraph__tooltip-action"
                onClick={(e) => {
                  e.stopPropagation();
                  tooltip.action!.run();
                }}
              >
                {tooltip.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="hd-bodygraph__chrome hd-print-hidden">
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
              aria-pressed={layer === key}
              className={`hd-bodygraph__layer-btn${layer === key ? " is-active" : ""}`}
            >
              {key !== "all" && (
                <i style={{ background: key === "p" ? COLOR_P : COLOR_D }} />
              )}
              {label}
            </button>
          ))}
          <button type="button" onClick={exportPng} className="hd-bodygraph__export">
            PNG
          </button>
        </div>

        <details className="hd-bodygraph__more">
          <summary>Центры и легенда</summary>
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
              <i style={{ background: COLOR_P }} /> Личность
            </span>
            <span className="hd-bodygraph__legend-item">
              <i style={{ background: COLOR_D }} /> Дизайн
            </span>
            <span className="hd-bodygraph__legend-item">
              <i className="hd-bodygraph__legend-swatch" /> Центр
            </span>
            {transits && (
              <span className="hd-bodygraph__legend-item">
                <i className="hd-bodygraph__legend-transit" /> Транзит
              </span>
            )}
            {partnerGates && (
              <span className="hd-bodygraph__legend-item">
                <i style={{ background: "#6aa8a0" }} /> Партнёр
              </span>
            )}
            {electromagneticChannels && electromagneticChannels.size > 0 && (
              <span className="hd-bodygraph__legend-item">
                <i className="hd-bodygraph__legend-electro" /> Электромагнетика
              </span>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
