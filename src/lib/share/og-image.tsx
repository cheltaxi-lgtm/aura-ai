import { ImageResponse } from "next/og";
import { masterDisplayName } from "@/lib/share-reading";
import {
  buildOgTemplateProps,
  ogKindAccent,
  ogKindLabel,
  resolveOgVisualKind,
} from "@/lib/share/og-template";
import type { ShareKind, SharePublicPayload } from "@/lib/share/types";

export const SHARE_OG_SIZE = { width: 1200, height: 630 };

const OG_FONT_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@5.0.8/cyrillic-400-normal.woff";

let cachedOgFont: ArrayBuffer | null = null;

async function loadOgFont(): Promise<ArrayBuffer | null> {
  if (cachedOgFont) return cachedOgFont;
  try {
    const res = await fetch(OG_FONT_URL, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    cachedOgFont = await res.arrayBuffer();
    return cachedOgFont;
  } catch {
    return null;
  }
}

function borderAccent(accent: string): string {
  return accent.replace(/0\.9(?=\s*\))/, "0.45").replace(/0\.95(?=\s*\))/, "0.45");
}

export async function buildShareOgImageResponse(
  payload: SharePublicPayload,
  kind: ShareKind
): Promise<ImageResponse> {
  const visualKind = resolveOgVisualKind(payload, kind);
  const master =
    payload.masterName ??
    (payload.masterKey ? masterDisplayName(payload.masterKey) : "");

  const { title, cards } = buildOgTemplateProps(payload, kind);
  const accent = ogKindAccent(visualKind);
  const kindLabel = ogKindLabel(visualKind);
  const fontData = await loadOgFont();
  const fontFamily = fontData ? "Noto Serif" : "serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "48px 56px",
          background: "linear-gradient(145deg, #0a0812 0%, #1a1228 45%, #2a1a3d 100%)",
          color: "#ede6da",
          fontFamily,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: `3px solid ${borderAccent(accent)}`,
            borderRadius: 24,
            padding: "40px 48px",
            background: "linear-gradient(180deg, rgba(18,16,26,0.92) 0%, rgba(8,6,14,0.96) 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 13,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {`Zovus · ${kindLabel}`}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1.2,
              color: "#ffffff",
              maxWidth: 900,
            }}
          >
            Посмотри мой расклад
          </div>
          {master ? (
            <div
              style={{
                display: "flex",
                marginTop: 16,
                fontSize: 20,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {master}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.25,
              color: "rgba(237,230,218,0.95)",
              maxWidth: 880,
            }}
          >
            {title}
          </div>
          {cards ? (
            <div style={{ display: "flex", marginTop: 20, fontSize: 22, color: accent }}>{cards}</div>
          ) : null}
          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 32px",
              borderRadius: 999,
              background: "rgba(201, 162, 74, 0.18)",
              border: "1px solid rgba(201, 162, 74, 0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "rgba(245, 230, 184, 0.95)",
              }}
            >
              Открыть на zovus.ru →
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SHARE_OG_SIZE,
      ...(fontData
        ? {
            fonts: [
              {
                name: "Noto Serif",
                data: fontData,
                style: "normal" as const,
                weight: 400,
              },
            ],
          }
        : {}),
    }
  );
}

export async function buildShareOgFallbackResponse(): Promise<ImageResponse> {
  return buildShareOgImageResponse(
    { kind: "reading", title: "Мой расклад", excerpt: "", cards: [] },
    "reading"
  );
}
