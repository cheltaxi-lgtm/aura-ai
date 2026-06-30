import { ImageResponse } from "next/og";

export const alt = "Zovus — эзотерический расклад";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ShareOgPayload {
  title?: string;
  excerpt?: string;
  cards?: { name: string }[];
}

interface Props {
  params: Promise<{ token: string }>;
}

export default async function Image({ params }: Props) {
  const { token } = await params;

  let snapshotPayload: ShareOgPayload | null = null;

  try {
    const internalBase = process.env.INTERNAL_APP_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
    const res = await fetch(`${internalBase}/api/share/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { payload?: ShareOgPayload };
      snapshotPayload = data.payload ?? null;
    }
  } catch {
    snapshotPayload = null;
  }

  const title = snapshotPayload?.title ?? "Мой расклад Zovus";
  const excerpt =
    snapshotPayload?.excerpt?.slice(0, 120) ?? "Получите свой персональный расклад";
  const cards = snapshotPayload?.cards?.map((c) => c.name).slice(0, 3).join(" · ") ?? "";

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
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 14,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(201, 162, 74, 0.85)",
            }}
          >
            Zovus
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
            <div style={{ marginTop: 12, fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
              {cards}
            </div>
          ) : null}
        </div>
        <div style={{ maxWidth: 900 }}>
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.45,
              fontStyle: "italic",
              color: "rgba(237,230,218,0.85)",
            }}
          >
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
            zovus.ru
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
