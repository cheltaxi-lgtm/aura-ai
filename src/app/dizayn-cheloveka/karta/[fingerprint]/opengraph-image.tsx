import { ImageResponse } from "next/og";
import { getHdChartByFingerprint } from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  type HdChart,
} from "@/lib/human-design";
import {
  HD_CENTER_SHAPES,
  HD_CHANNEL_SEGMENTS,
  HD_GATE_ANCHORS,
} from "@/components/human-design/bodygraph-geometry";

export const runtime = "nodejs";
export const alt = "Карта Дизайна Человека";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR_P = "#f2e7c9";
const COLOR_D = "#e05555";
const COLOR_BASE = "rgba(232, 199, 126, 0.12)";

function bodygraphSvg(chart: HdChart): string {
  const gates = new Map<number, "p" | "d">();
  for (const a of chart.personality) gates.set(a.gate, "p");
  for (const a of chart.designActivations) {
    if (!gates.has(a.gate)) gates.set(a.gate, "d");
  }
  const definedCenters = new Set(chart.definedCenters);
  const definedChannels = new Set(chart.channels.filter((c) => c.defined).map((c) => c.key));

  const channels = HD_CHANNEL_SEGMENTS.map((seg) => {
    const a = gates.get(seg.gates[0]);
    const b = gates.get(seg.gates[1]);
    const w = definedChannels.has(seg.key) ? 5 : 3;
    const cA = a ? (a === "d" ? COLOR_D : COLOR_P) : COLOR_BASE;
    const cB = b ? (b === "d" ? COLOR_D : COLOR_P) : COLOR_BASE;
    return (
      `<line x1="${seg.ax}" y1="${seg.ay}" x2="${seg.mx}" y2="${seg.my}" stroke="${cA}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<line x1="${seg.mx}" y1="${seg.my}" x2="${seg.bx}" y2="${seg.by}" stroke="${cB}" stroke-width="${w}" stroke-linecap="round"/>`
    );
  }).join("");

  const centers = Object.values(HD_CENTER_SHAPES)
    .map((s) => {
      const defined = definedCenters.has(s.key);
      const fill = defined ? "#c9a24a" : "rgba(255,255,255,0.05)";
      const stroke = defined ? "#ffe8a8" : "rgba(232,199,126,0.4)";
      return `<path d="${s.path}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    })
    .join("");

  const gateCircles = HD_GATE_ANCHORS.map((a) => {
    const act = gates.get(a.gate);
    const fill = act ? (act === "d" ? COLOR_D : COLOR_P) : "#17131f";
    const textFill = act ? "#17131f" : "rgba(232,199,126,0.7)";
    return (
      `<circle cx="${a.lx}" cy="${a.ly}" r="8" fill="${fill}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>` +
      `<text x="${a.lx}" y="${a.ly + 3}" font-family="sans-serif" font-size="9" font-weight="${act ? 700 : 400}" text-anchor="middle" fill="${textFill}">${a.gate}</text>`
    );
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 700" width="360" height="630">${channels}${centers}${gateCircles}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  const { fingerprint } = await params;
  const chart = await getHdChartByFingerprint(fingerprint).catch(() => null);

  const typeName = chart ? TYPE_META[chart.chart.type].nameRu : "Дизайн Человека";
  const profile = chart ? chart.chart.profile : "";
  const authority = chart ? AUTHORITY_NAMES_RU[chart.chart.authority] : "";
  const profileName = chart ? (PROFILE_NAMES_RU[chart.chart.profile] ?? "") : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background:
            "radial-gradient(ellipse 70% 50% at 30% 20%, rgba(155,127,212,0.25), transparent 70%), linear-gradient(150deg, #14101f 0%, #07060d 100%)",
          color: "#F5E6B8",
          padding: 48,
        }}
      >
        {chart && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bodygraphSvg(chart.chart)} width={360} height={630} alt="" />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: chart ? 56 : 0,
            flex: 1,
          }}
        >
          <div style={{ fontSize: 20, letterSpacing: 6, color: "rgba(232,199,126,0.6)" }}>
            ZOVUS · ДИЗАЙН ЧЕЛОВЕКА
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }}>
            {typeName}
          </div>
          {chart && (
            <div style={{ fontSize: 30, color: "rgba(245,230,184,0.85)", marginTop: 14 }}>
              Профиль {profile} · {profileName}
            </div>
          )}
          {chart && (
            <div style={{ fontSize: 26, color: "rgba(245,230,184,0.65)", marginTop: 8 }}>
              Авторитет: {authority}
            </div>
          )}
          <div
            style={{
              marginTop: 36,
              fontSize: 24,
              color: "#0c0a14",
              background: "linear-gradient(90deg, #e8c77e, #c9a24a)",
              padding: "14px 28px",
              borderRadius: 999,
              alignSelf: "flex-start",
              fontWeight: 600,
            }}
          >
            Рассчитать свою карту бесплатно
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
