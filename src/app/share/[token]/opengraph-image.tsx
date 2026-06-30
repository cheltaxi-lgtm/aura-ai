import { ImageResponse } from "next/og";
import { getShareSnapshotByToken } from "@/lib/share/get-snapshot";

export const runtime = "nodejs";
export const alt = "Zovus — эзотерический расклад";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function Image({ params }: Props) {
  const { token } = await params;
  const snapshot = await getShareSnapshotByToken(token, false);

  const title = snapshot?.payload.title ?? "Мой расклад Zovus";
  const excerpt = snapshot?.payload.excerpt?.slice(0, 120) ?? "Получите свой персональный расклад";
  const cards = snapshot?.payload.cards?.map((c) => c.name).slice(0, 3).join(" · ") ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          background: "linear-gradient(165deg, #12101a 0%, #0a0812 100%)",
          color: "#ede6da",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: "2px solid rgba(201, 162, 74, 0.4)",
            borderRadius: 16,
            display: "flex",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
          <div
            style={{
              fontSize: 14,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(201, 162, 74, 0.85)",
            }}
          >
            Zovus · эзотерический оракул
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.15,
              color: "#ffffff",
              maxWidth: 900,
            }}
          >
            {title}
          </div>
          {cards ? (
            <div style={{ marginTop: 12, fontSize: 22, color: "rgba(255,255,255,0.55)" }}>{cards}</div>
          ) : null}
        </div>
        <div style={{ zIndex: 1, maxWidth: 900 }}>
          <div style={{ fontSize: 24, lineHeight: 1.45, fontStyle: "italic", color: "rgba(237,230,218,0.85)" }}>
            {excerpt}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 16,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(201, 162, 74, 0.7)",
            }}
          >
            Получить свой расклад → zovus.ru
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
