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

  const rawTitle = snapshot?.payload.title ?? "Мой расклад";
  const title = rawTitle.length > 56 ? `${rawTitle.slice(0, 55)}…` : rawTitle;
  const master =
    snapshot?.payload.masterName ??
    (snapshot?.payload.masterKey ? masterDisplayName(snapshot.payload.masterKey) : "");
  const cards = snapshot?.payload.cards?.map((c) => c.name).slice(0, 3).join("  ·  ") ?? "";

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
          padding: "48px 56px",
          background: "linear-gradient(145deg, #0a0812 0%, #1a1228 45%, #2a1a3d 100%)",
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
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: "3px solid rgba(201, 162, 74, 0.45)",
            borderRadius: 24,
            padding: "40px 48px",
            background: "linear-gradient(180deg, rgba(18,16,26,0.92) 0%, rgba(8,6,14,0.96) 100%)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "rgba(201, 162, 74, 0.9)",
            }}
          >
            Zovus
          </div>
          <div
            style={{
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
            <div style={{ marginTop: 16, fontSize: 20, color: "rgba(255,255,255,0.5)" }}>{master}</div>
          ) : null}
          <div
            style={{
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
            <div style={{ marginTop: 20, fontSize: 22, color: "rgba(201, 162, 74, 0.8)" }}>{cards}</div>
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
    { width: 1200, height: 630 }
  );

  const buffer = await imageResponse.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
