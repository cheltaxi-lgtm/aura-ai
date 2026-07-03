import { getShareSnapshotByToken } from "@/lib/share/get-snapshot";
import { buildShareOgFallbackResponse, buildShareOgImageResponse } from "@/lib/share/og-image";
import { toPublicPayload } from "@/lib/share/public-payload";
import type { ShareKind, SharePublicPayload } from "@/lib/share/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  let kind: ShareKind = "reading";
  let payload: SharePublicPayload = {
    kind: "reading",
    title: "Мой расклад",
    excerpt: "",
    cards: [],
  };

  try {
    const snapshot = await getShareSnapshotByToken(token, false);
    if (snapshot) {
      kind = snapshot.kind;
      payload = toPublicPayload(snapshot.payload, {
        excerptTruncated: snapshot.payload.excerptTruncated,
        legacySnapshot: snapshot.payload.legacySnapshot,
      });
    }
  } catch (err) {
    console.error("[share/og] snapshot load failed:", err);
  }

  try {
    return await buildShareOgImageResponse(payload, kind);
  } catch (err) {
    console.error("[share/og] render failed:", err);
    return buildShareOgFallbackResponse();
  }
}
