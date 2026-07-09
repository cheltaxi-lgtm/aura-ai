import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";
import {
  buildOgTemplateProps,
  ogKindAccent,
  ogKindLabel,
  resolveOgVisualKind,
} from "@/lib/share/og-template";
import type { ShareKind, SharePublicPayload } from "@/lib/share/types";

export const SHARE_OG_SIZE = { width: 1200, height: 630 };

const OG_FONT_REGULAR =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@5.0.8/cyrillic-400-normal.woff";
const OG_FONT_BOLD =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-serif@5.0.8/cyrillic-700-normal.woff";

let cachedOgFontRegular: ArrayBuffer | null = null;
let cachedOgFontBold: ArrayBuffer | null = null;

async function loadOgFont(url: string, cache: "regular" | "bold"): Promise<ArrayBuffer | null> {
  const slot = cache === "regular" ? cachedOgFontRegular : cachedOgFontBold;
  if (slot) return slot;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    if (cache === "regular") cachedOgFontRegular = data;
    else cachedOgFontBold = data;
    return data;
  } catch {
    return null;
  }
}

export async function buildShareOgImageResponse(
  payload: SharePublicPayload,
  kind: ShareKind
): Promise<ImageResponse> {
  const visualKind = resolveOgVisualKind(payload, kind);
  const { title, master, cards, teaser, date, isTopic } = buildOgTemplateProps(payload, kind);
  const accent = ogKindAccent(visualKind);
  const kindLabel = ogKindLabel(visualKind);
  const fontRegular = await loadOgFont(OG_FONT_REGULAR, "regular");
  const fontBold = await loadOgFont(OG_FONT_BOLD, "bold");
  const fontFamily = fontRegular ? "Noto Serif" : "serif";

  const fonts = [];
  if (fontRegular) {
    fonts.push({
      name: "Noto Serif",
      data: fontRegular,
      style: "normal" as const,
      weight: 400 as const,
    });
  }
  if (fontBold) {
    fonts.push({
      name: "Noto Serif",
      data: fontBold,
      style: "normal" as const,
      weight: 700 as const,
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 48px",
          background: "radial-gradient(ellipse 120% 80% at 50% 0%, #2a1a3d 0%, #0a0812 55%, #050408 100%)",
          color: "#ede6da",
          fontFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            border: "1px solid rgba(232, 199, 126, 0.22)",
            borderRadius: 28,
            padding: "3px",
            background: "linear-gradient(145deg, rgba(232,199,126,0.18) 0%, rgba(232,199,126,0.04) 50%, rgba(232,199,126,0.14) 100%)",
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
              borderRadius: 25,
              padding: "44px 56px",
              background: "linear-gradient(180deg, rgba(14,12,22,0.97) 0%, rgba(6,5,10,0.99) 100%)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                width: "100%",
              }}
            >
              <div style={{ display: "flex", width: 48, height: 1, background: accent, opacity: 0.35 }} />
              <div
                style={{
                  display: "flex",
                  fontSize: 11,
                  letterSpacing: "0.34em",
                  textTransform: "uppercase",
                  color: accent,
                }}
              >
                {BRAND_NAME}
              </div>
              <div style={{ display: "flex", width: 48, height: 1, background: accent, opacity: 0.35 }} />
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 14,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.42)",
              }}
            >
              {kindLabel}
            </div>

            {master ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 28,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "rgba(245, 230, 184, 0.92)",
                }}
              >
                {`Мастер ${master}`}
              </div>
            ) : null}

            {date ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 10,
                  fontSize: 15,
                  color: "rgba(255,255,255,0.38)",
                }}
              >
                {date}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                marginTop: 28,
                width: 120,
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(232,199,126,0.45), transparent)",
              }}
            />

            {isTopic ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 22,
                  fontSize: 12,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                Вопрос
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                marginTop: isTopic ? 12 : 22,
                fontSize: isTopic ? 26 : 32,
                fontWeight: 700,
                lineHeight: 1.28,
                color: "#ffffff",
                maxWidth: 900,
              }}
            >
              {isTopic ? `«${title}»` : title}
            </div>

            {teaser ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 22,
                  fontSize: 19,
                  lineHeight: 1.45,
                  color: "rgba(237,230,218,0.72)",
                  maxWidth: 820,
                  fontStyle: "italic",
                }}
              >
                {teaser}
              </div>
            ) : null}

            {cards ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 24,
                  fontSize: 18,
                  letterSpacing: "0.04em",
                  color: accent,
                }}
              >
                {cards}
              </div>
            ) : null}

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 28px",
                borderRadius: 999,
                background: "linear-gradient(135deg, rgba(232,199,126,0.16) 0%, rgba(201,162,74,0.08) 100%)",
                border: "1px solid rgba(232, 199, 126, 0.38)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(245, 230, 184, 0.95)",
                }}
              >
                Открыть расклад
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SHARE_OG_SIZE,
      ...(fonts.length ? { fonts } : {}),
    }
  );
}

export async function buildShareOgFallbackResponse(): Promise<ImageResponse> {
  return buildShareOgImageResponse(
    { kind: "reading", title: "Мой расклад", excerpt: "", cards: [] },
    "reading"
  );
}
