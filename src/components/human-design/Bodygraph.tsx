"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "framer-motion";
import type { HdBodyKey, HdCenterKey, HdChart, HdPublicChart } from "@/lib/human-design";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CHANNELS,
  GATE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
  gateAnchor,
} from "./bodygraph-geometry";
import {
  GATE_WHEEL,
  MANDALA_CX,
  MANDALA_CY,
  MANDALA_R_DESIGN,
  MANDALA_R_GATE_NUM,
  MANDALA_R_INNER,
  MANDALA_R_OUTER,
  MANDALA_R_PERSONALITY,
  MANDALA_R_SIGN,
  VIEWBOX_CHART,
  VIEWBOX_MANDALA,
  ZODIAC_SIGNS,
  activationLongitude,
  ringSectorPath,
  wheelPoint,
  wheelTick,
} from "./bodygraph-mandala";
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

function buildGateActivity(chart: HdChart | HdPublicChart): Map<number, GateActivity> {
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BodygraphProps {
  /** Owner views pass the full chart; public share payloads omit `design`. */
  chart: HdChart | HdPublicChart;
  /** gate → transiting body, for the live-transit overlay. */
  transits?: Map<number, HdBodyKey> | null;
  /** Channels completed only by combining two charts (composite). */
  electromagneticChannels?: Set<string> | null;
  /** Gates activated only by the partner in composite mode. */
  partnerGates?: Set<number> | null;
  /** When set, dim channels outside this set (connection focus filters). */
  focusChannels?: Set<string> | null;
  /** Ask Evelina about a center (paid). */
  onCenterInsight?: (center: HdCenterKey) => void;
  /** Printed into the PNG export header. */
  subjectName?: string | null;
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
  focusChannels = null,
  onCenterInsight,
  subjectName,
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
  /** Gate lit from the activation columns / chart hover (two-way sync). */
  const [gateHot, setGateHot] = useState<number | null>(null);
  // SSR-consistent default (the chart page is server-rendered): always start
  // with the ring on, then the effect applies the saved choice / media query.
  // A lazy initializer reading matchMedia would disagree with the server HTML
  // and React would leave the stale SSR viewBox attribute unpatched.
  const [mandala, setMandala] = useState(true);
  const mandalaUserSet = useRef(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("hd-mandala");
    } catch {
      /* private mode */
    }
    if (saved === "0" || saved === "1") {
      mandalaUserSet.current = true;
      setMandala(saved === "1");
      return;
    }
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => {
      if (!mandalaUserSet.current) setMandala(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
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
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    d0: number;
    k0: number;
    mx0: number;
    my0: number;
    x0: number;
    y0: number;
  } | null>(null);

  // Chart switch (same component instance / composite remount): drop overlay state.
  const chartEpoch = `${chart.type}:${chart.profile}:${chart.activeGates.join(",")}`;
  useEffect(() => {
    setTooltip(null);
    setLayer("all");
    setHighlightCenter(null);
    setGateHot(null);
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
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      if (pointersRef.current.size === 2) {
        const [p1, p2] = [...pointersRef.current.values()];
        pinchRef.current = {
          d0: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)),
          k0: zoomRef.current.k,
          mx0: (p1.x + p2.x) / 2,
          my0: (p1.y + p2.y) / 2,
          x0: zoomRef.current.x,
          y0: zoomRef.current.y,
        };
        dragRef.current = null;
        setTooltip(null);
        return;
      }
      if (zoom.k <= 1) return;
      setTooltip(null); // anchor rect moves under pan — drop the stale tooltip
      dragRef.current = { px: e.clientX, py: e.clientY, zx: zoom.x, zy: zoom.y };
    },
    [zoom]
  );

  const onPanMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size === 2) {
        const [p1, p2] = [...pointersRef.current.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        setZoom((z) =>
          clampZoom({
            ...z,
            k: pinch.k0 * (d / pinch.d0),
            x: pinch.x0 + (mx - pinch.mx0),
            y: pinch.y0 + (my - pinch.my0),
          })
        );
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      setZoom((z) =>
        clampZoom({ ...z, x: drag.zx + (e.clientX - drag.px), y: drag.zy + (e.clientY - drag.py) })
      );
    },
    [clampZoom]
  );

  const onPanEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
    dragRef.current = null;
    // One finger left after a pinch — keep panning from it seamlessly.
    const rest = [...pointersRef.current.values()][0];
    if (rest && pointersRef.current.size === 1 && zoomRef.current.k > 1) {
      dragRef.current = { px: rest.x, py: rest.y, zx: zoomRef.current.x, zy: zoomRef.current.y };
    }
  }, []);

  const gateActivity = useMemo(() => buildGateActivity(chart), [chart]);
  const definedCenters = useMemo(() => new Set(chart.definedCenters), [chart]);
  const definedChannels = useMemo(
    () => new Set(chart.channels.filter((c) => c.defined).map((c) => c.key)),
    [chart]
  );
  const highlightChannels = useMemo(() => {
    if (focusChannels) return focusChannels;
    if (highlightCenter) return channelsForCenter(highlightCenter);
    return null;
  }, [focusChannels, highlightCenter]);

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

  const toggleMandala = useCallback(() => {
    mandalaUserSet.current = true;
    setMandala((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("hd-mandala", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  /**
   * Share-grade PNG: mandala composition + activation columns + identity
   * header. Built as a standalone SVG (nested svg re-frames the live tree
   * into the wide mandala viewBox), then rasterized at 2x.
   */
  const exportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const inner = svg.innerHTML;
    const name = subjectName?.trim() || "Моя карта";
    const facts = `${TYPE_META[chart.type].nameRu} · Профиль ${chart.profile} · ${AUTHORITY_NAMES_RU[chart.authority]}`;

    const column = (side: "p" | "d", x: number): string => {
      const byBody = side === "p" ? personalityByBody : designByBody;
      const title = side === "p" ? "ЛИЧНОСТЬ" : "ДИЗАЙН";
      const color = side === "p" ? COLOR_P : COLOR_D;
      const rows = BODY_ORDER.map((body, i) => {
        const act = byBody.get(body);
        const y = 210 + i * 24;
        return `<text x="${x}" y="${y}" font-size="15" fill="${color}">${BODY_GLYPH[body]}</text>`
          + `<text x="${x + 26}" y="${y}" font-size="14" fill="${act ? color : "rgba(255,255,255,0.25)"}">`
          + (act ? `${act.gate}<tspan fill="rgba(255,255,255,0.45)">.${act.line}</tspan>` : "—")
          + `</text>`;
      }).join("");
      return `<text x="${x}" y="182" font-size="11" letter-spacing="3" fill="${color}">${title}</text>${rows}`;
    };

    const W = 1240;
    const H = 920;
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`
      + `<rect width="${W}" height="${H}" fill="#0a0908"/>`
      + `<text x="48" y="62" font-size="14" letter-spacing="5" fill="#c9a24a">ZOVUS · ДИЗАЙН ЧЕЛОВЕКА</text>`
      + `<text x="48" y="102" font-size="30" font-weight="600" fill="#f2e7c9">${escapeXml(name)}</text>`
      + `<text x="48" y="130" font-size="14" fill="rgba(242,231,201,0.6)">${escapeXml(facts)}</text>`
      + `<svg x="8" y="146" width="756" height="756" viewBox="${VIEWBOX_MANDALA}">${inner}</svg>`
      + column("p", 820)
      + column("d", 1010)
      + `<text x="48" y="${H - 26}" font-size="12" fill="rgba(242,231,201,0.35)">zovus.ru</text>`
      + `</svg>`;

    const blob = new Blob([doc], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onerror = () => URL.revokeObjectURL(url);
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
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
  }, [chart, subjectName, personalityByBody, designByBody]);

  const centerOrder: HdCenterKey[] = [
    "head", "ajna", "throat", "g", "heart", "spleen", "solar", "sacral", "root",
  ];

  // Public share payloads carry no design moment (birth-privacy strip).
  const designDate =
    "design" in chart && chart.design ? formatDesignDate(chart.design.utcIso) : "";
  const channelDrawDelay = 0.15;
  const centerIgniteDelay = channelDrawDelay + HD_CHANNEL_SEGMENTS.length * 0.03;
  const gatesDelay = centerIgniteDelay + centerOrder.length * 0.07 + 0.15;

  // Tilt (motion values, no rerender) + zoom (state) on the layout only —
  // the toolbar and tooltip stay flat and readable.
  const layoutTransform = useMotionTemplate`perspective(1200px) rotateX(${tiltRx}deg) rotateY(${tiltRy}deg) scale(${zoom.k}) translate(${zoom.x / zoom.k}px, ${zoom.y / zoom.k}px)`;

  /** Planet markers on the mandala rings, angularly de-collided. */
  const planetMarkers = useCallback(
    (side: "p" | "d") => {
      const acts = side === "p" ? chart.personality : chart.designActivations;
      const sorted = acts
        .map((a) => ({ a, L: activationLongitude(a) }))
        .sort((x, y) => x.L - y.L);
      let prev = -999;
      const r = side === "p" ? MANDALA_R_PERSONALITY : MANDALA_R_DESIGN;
      return sorted.map(({ a, L }) => {
        let LL = L;
        if (LL - prev < 4) LL = prev + 4;
        prev = LL;
        const pt = wheelPoint(LL, r);
        return { body: a.body, gate: a.gate, line: a.line, x: pt.x, y: pt.y };
      });
    },
    [chart]
  );

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
              <li
                key={body}
                className={`${act ? "is-active" : ""}${act && gateHot === act.gate ? " is-hot" : ""}`}
                onMouseEnter={act ? () => setGateHot(act.gate) : undefined}
                onMouseLeave={act ? () => setGateHot(null) : undefined}
              >
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
          setGateHot(null);
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
            viewBox={mandala ? VIEWBOX_MANDALA : VIEWBOX_CHART}
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

            {/* Rave Mandala ring: 64 gates in zodiac order + planet markers */}
            <g>
              <circle cx={MANDALA_CX} cy={MANDALA_CY} r={MANDALA_R_INNER} fill="none" stroke="rgba(232,199,126,0.16)" strokeWidth={1} />
              <circle cx={MANDALA_CX} cy={MANDALA_CY} r={MANDALA_R_OUTER} fill="none" stroke="rgba(232,199,126,0.22)" strokeWidth={1} />
              {ZODIAC_SIGNS.map((s) => {
                const tick = wheelTick(s.start, MANDALA_R_INNER - 3, MANDALA_R_OUTER + 3);
                const gp = wheelPoint(s.mid, MANDALA_R_SIGN);
                return (
                  <g key={s.nameRu} aria-hidden="true">
                    <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="rgba(232,199,126,0.35)" strokeWidth={1.2} />
                    <text x={gp.x} y={gp.y + 3.5} textAnchor="middle" fontSize={11} fill="rgba(232,199,126,0.55)">
                      {s.glyph}
                    </text>
                  </g>
                );
              })}
              {GATE_WHEEL.map((seg) => {
                const a = gateActivity.get(seg.gate);
                const active = Boolean(a);
                const source = a?.pLine ? "p" : a?.dLine ? "d" : undefined;
                const visible = layerVisible(source, layer);
                const hot = gateHot === seg.gate;
                const np = wheelPoint(seg.mid, MANDALA_R_GATE_NUM);
                return (
                  <g
                    key={seg.gate}
                    opacity={visible ? 1 : 0.25}
                    className="hd-bodygraph__gate"
                    onMouseEnter={(e) => {
                      showTooltipFor(e.currentTarget, gateTooltipData(seg.gate));
                      setGateHot(seg.gate);
                    }}
                    onMouseLeave={() => setGateHot(null)}
                    onClick={(e) => showTooltipFor(e.currentTarget, gateTooltipData(seg.gate))}
                    onKeyDown={(e) => {
                      if (active && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        showTooltipFor(e.currentTarget, gateTooltipData(seg.gate));
                      }
                    }}
                    onFocus={(e) => {
                      showTooltipFor(e.currentTarget, gateTooltipData(seg.gate));
                      setGateHot(seg.gate);
                    }}
                    onBlur={(e) => {
                      setGateHot(null);
                      hideTooltip(e);
                    }}
                    tabIndex={active ? 0 : undefined}
                    role={active ? "button" : undefined}
                    aria-label={
                      active
                        ? `Ворота ${seg.gate} — ${GATE_NAMES_RU[seg.gate] ?? ""}, активированы`
                        : undefined
                    }
                  >
                    <path
                      d={ringSectorPath(seg.mid - 2.7125, seg.mid + 2.7125, MANDALA_R_INNER, MANDALA_R_OUTER)}
                      fill={active ? "rgba(232,199,126,0.16)" : "rgba(232,199,126,0.035)"}
                      stroke={hot ? "rgba(255,232,168,0.9)" : "transparent"}
                      strokeWidth={hot ? 1.2 : 0}
                    />
                    <text
                      x={np.x}
                      y={np.y + 2.5}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={active ? 700 : 400}
                      fill={active ? COLOR_P : "rgba(232,199,126,0.42)"}
                      stroke="#0f0d0b"
                      strokeWidth={active ? 0 : 2}
                      style={{ paintOrder: "stroke" }}
                    >
                      {seg.gate}
                    </text>
                  </g>
                );
              })}
              {(["d", "p"] as const).map((side) =>
                planetMarkers(side).map((m) => (
                  <text
                    key={`${side}-${m.body}`}
                    x={m.x}
                    y={m.y + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fill={side === "p" ? COLOR_P : COLOR_D}
                    opacity={layer === "all" || layer === side ? 0.95 : 0.15}
                    stroke="#0a0908"
                    strokeWidth={3}
                    style={{ paintOrder: "stroke", cursor: "pointer" }}
                    onMouseEnter={(e) =>
                      showTooltipFor(e.currentTarget, {
                        title: `${BODY_NAMES_RU[m.body]} — ${side === "p" ? "Личность" : "Дизайн"}`,
                        lines: [`Ворота ${m.gate}.${m.line} — ${GATE_NAMES_RU[m.gate] ?? ""}`],
                      })
                    }
                    onClick={(e) =>
                      showTooltipFor(e.currentTarget, {
                        title: `${BODY_NAMES_RU[m.body]} — ${side === "p" ? "Личность" : "Дизайн"}`,
                        lines: [`Ворота ${m.gate}.${m.line} — ${GATE_NAMES_RU[m.gate] ?? ""}`],
                      })
                    }
                  >
                    {BODY_GLYPH[m.body]}
                  </text>
                ))
              )}
            </g>

            {/* Channels — path-drawing birth animation */}
            <g strokeLinecap="round">
              {HD_CHANNEL_SEGMENTS.map((seg, i) => {
                const aAct = gateActivity.get(seg.gates[0]);
                const bAct = gateActivity.get(seg.gates[1]);
                const aBoth = Boolean(aAct?.pLine && aAct?.dLine);
                const bBoth = Boolean(bAct?.pLine && bAct?.dLine);
                const aSource = aAct?.pLine ? "p" : aAct?.dLine ? "d" : undefined;
                const bSource = bAct?.pLine ? "p" : bAct?.dLine ? "d" : undefined;
                const defined = definedChannels.has(seg.key);
                const electro = electromagneticChannels?.has(seg.key) ?? false;
                const aVisible = layerVisible(aSource, layer);
                const bVisible = layerVisible(bSource, layer);
                const highlighted = highlightChannels?.has(seg.key) ?? false;
                const dimmed = highlightChannels !== null && !highlighted;
                const delay = reduceMotion ? 0 : channelDrawDelay + i * 0.03;
                // Perpendicular offsets for P+D striped halves.
                const adx = seg.mx - seg.ax;
                const ady = seg.my - seg.ay;
                const aLen = Math.hypot(adx, ady) || 1;
                const anx = (-ady / aLen) * 1.7;
                const any = (adx / aLen) * 1.7;
                const bdx = seg.bx - seg.mx;
                const bdy = seg.by - seg.my;
                const bLen = Math.hypot(bdx, bdy) || 1;
                const bnx = (-bdy / bLen) * 1.7;
                const bny = (bdx / bLen) * 1.7;
                const halfWidth = defined ? 5 : 3;
                const stripeWidth = defined ? 2.4 : 2;
                const draw = (
                  x1: number, y1: number, x2: number, y2: number,
                  stroke: string, width: number, opacity: number, cls: string
                ) => (
                  <motion.line
                    key={`${x1.toFixed(1)}-${y1.toFixed(1)}-${stroke}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={stroke}
                    strokeWidth={width}
                    opacity={opacity}
                    className={cls}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay, ease: "easeOut" }}
                  />
                );
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
                    {aBoth
                      ? [
                          draw(seg.ax - anx, seg.ay - any, seg.mx - anx, seg.my - any,
                            COLOR_P, stripeWidth, layerVisible("p", layer) ? 1 : 0.25, "hd-ch-p"),
                          draw(seg.ax + anx, seg.ay + any, seg.mx + anx, seg.my + any,
                            COLOR_D, stripeWidth, layerVisible("d", layer) ? 1 : 0.25, "hd-ch-d"),
                        ]
                      : draw(seg.ax, seg.ay, seg.mx, seg.my,
                          aVisible ? halfColor(Boolean(aAct), aSource) : COLOR_BASE,
                          halfWidth, aVisible ? 1 : 0.25,
                          aSource === "d" ? "hd-ch-d" : aSource === "p" ? "hd-ch-p" : "hd-ch-base")}
                    {bBoth
                      ? [
                          draw(seg.mx - bnx, seg.my - bny, seg.bx - bnx, seg.by - bny,
                            COLOR_P, stripeWidth, layerVisible("p", layer) ? 1 : 0.25, "hd-ch-p"),
                          draw(seg.mx + bnx, seg.my + bny, seg.bx + bnx, seg.by + bny,
                            COLOR_D, stripeWidth, layerVisible("d", layer) ? 1 : 0.25, "hd-ch-d"),
                        ]
                      : draw(seg.mx, seg.my, seg.bx, seg.by,
                          bVisible ? halfColor(Boolean(bAct), bSource) : COLOR_BASE,
                          halfWidth, bVisible ? 1 : 0.25,
                          bSource === "d" ? "hd-ch-d" : bSource === "p" ? "hd-ch-p" : "hd-ch-base")}
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
                        r={46}
                        fill={`url(#${gradGlow})`}
                        aria-hidden="true"
                        animate={reduceMotion ? undefined : { opacity: [0.5, 0.85, 0.5] }}
                        transition={reduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                      />
                    )}
                    <path
                      d={shape.path}
                      fill={defined ? `url(#${gradDefined})` : "#141210"}
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
                  </motion.g>
                );
              })}
            </g>

            {/* Gates: medallions for active, quiet numbers for the rest */}
            <g fontFamily="system-ui, sans-serif" textAnchor="middle">
              {HD_GATE_ANCHORS.map((anchor, gi) => {
                const a = gateActivity.get(anchor.gate);
                const active = Boolean(a);
                const both = Boolean(a?.pLine && a?.dLine);
                const source = a?.pLine ? "p" : a?.dLine ? "d" : undefined;
                const visible = layerVisible(source, layer);
                const transitBody = transits?.get(anchor.gate);
                const partnerOnly = !active && (partnerGates?.has(anchor.gate) ?? false);
                const focusable = active || Boolean(transitBody) || partnerOnly;
                const hot = gateHot === anchor.gate;
                const medallion = active || partnerOnly;
                return (
                  <g
                    key={anchor.gate}
                    onMouseEnter={(e) => {
                      showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate));
                      setGateHot(anchor.gate);
                    }}
                    onMouseLeave={() => setGateHot(null)}
                    onClick={(e) => showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate))}
                    onKeyDown={(e) => {
                      if (focusable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate));
                      }
                    }}
                    onFocus={(e) => {
                      showTooltipFor(e.currentTarget, gateTooltipData(anchor.gate));
                      setGateHot(anchor.gate);
                    }}
                    onBlur={(e) => {
                      setGateHot(null);
                      hideTooltip(e);
                    }}
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
                    <motion.g
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.35,
                        delay: reduceMotion ? 0 : gatesDelay + gi * 0.012,
                        ease: "backOut",
                      }}
                      style={{ transformOrigin: `${anchor.lx}px ${anchor.ly}px` }}
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
                      {hot && (
                        <circle
                          cx={anchor.lx}
                          cy={anchor.ly}
                          r={13}
                          fill="none"
                          stroke="rgba(255,232,168,0.95)"
                          strokeWidth={1.6}
                        />
                      )}
                      {medallion ? (
                        both ? (
                          <>
                            <path
                              d={`M${anchor.lx} ${anchor.ly - 9} A9 9 0 0 1 ${anchor.lx} ${anchor.ly + 9} Z`}
                              fill={COLOR_P}
                            />
                            <path
                              d={`M${anchor.lx} ${anchor.ly - 9} A9 9 0 0 0 ${anchor.lx} ${anchor.ly + 9} Z`}
                              fill={COLOR_D}
                            />
                            <circle
                              cx={anchor.lx}
                              cy={anchor.ly}
                              r={9}
                              fill="none"
                              stroke="rgba(255,255,255,0.5)"
                              strokeWidth={1}
                            />
                          </>
                        ) : (
                          <circle
                            cx={anchor.lx}
                            cy={anchor.ly}
                            r={9}
                            fill={
                              active
                                ? (a?.dLine && !a?.pLine ? COLOR_D : COLOR_P)
                                : "#6aa8a0"
                            }
                            stroke="rgba(255,255,255,0.5)"
                            strokeWidth={1}
                          />
                        )
                      ) : null}
                      <text
                        x={anchor.lx}
                        y={anchor.ly + (medallion ? 3 : 2.5)}
                        fontSize={medallion ? 9 : 7.5}
                        fontWeight={medallion ? 700 : 400}
                        fill={
                          medallion
                            ? "#17131f"
                            : "rgba(232,199,126,0.45)"
                        }
                        stroke={medallion ? "none" : "#100e0c"}
                        strokeWidth={medallion ? 0 : 2}
                        style={{ paintOrder: "stroke", pointerEvents: "none" }}
                      >
                        {anchor.gate}
                      </text>
                    </motion.g>
                    <circle cx={anchor.lx} cy={anchor.ly} r={10} fill="transparent" />
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
          <button
            type="button"
            onClick={toggleMandala}
            aria-pressed={mandala}
            className={`hd-bodygraph__layer-btn${mandala ? " is-active" : ""}`}
            title="Кольцо мандалы: 64 ворота в зодиакальном порядке и планеты карты"
          >
            Мандала
          </button>
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
