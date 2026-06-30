import { ImageResponse } from "next/og";
import { getShareSnapshotByToken } from "@/lib/share/get-snapshot";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const snapshot = await getShareSnapshotByToken(token, false);

  const title = snapshot?.payload.title ?? "Мой расклад Zovus";
  const excerpt =
    snapshot?.payload.excerpt?.slice(0, 120) ?? "Получите свой персональный расклад";
  const cards = snapshot?.payload.cards?.map((c) => c.name).slice(0, 3).join(" · ") ?? "";

  const imageResponse = new ImageResponse(
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
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
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
    { width: 1200, height: 630 }
  );

  const buffer = await imageResponse.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
