import { ImageResponse } from "next/og";
import { getShareSnapshotByToken } from "@/lib/share/get-snapshot";
import { masterDisplayName } from "@/lib/share-reading";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const snapshot = await getShareSnapshotByToken(token, false);

  const rawTitle = snapshot?.payload.title ?? "Мой расклад Zovus";
  const title = rawTitle.length > 72 ? `${rawTitle.slice(0, 71)}…` : rawTitle;
  const master =
    snapshot?.payload.masterName ??
    (snapshot?.payload.masterKey ? masterDisplayName(snapshot.payload.masterKey) : "");
  const cards = snapshot?.payload.cards?.map((c) => c.name).slice(0, 3).join(" · ") ?? "";

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "56px 64px",
          background: "linear-gradient(165deg, #12101a 0%, #0a0812 100%)",
          color: "#ede6da",
          fontFamily: "serif",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
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
          {master ? (
            <div
              style={{
                fontSize: 22,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {master}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 1.2,
              color: "#ffffff",
              maxWidth: 960,
            }}
          >
            {title}
          </div>
          {cards ? (
            <div style={{ fontSize: 24, color: "rgba(201, 162, 74, 0.75)" }}>{cards}</div>
          ) : null}
          <div
            style={{
              marginTop: 12,
              fontSize: 16,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(201, 162, 74, 0.55)",
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
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
