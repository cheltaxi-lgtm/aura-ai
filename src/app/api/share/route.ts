import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { clientIp, enforceShareCreateRateLimit } from "@/lib/api-guards";
import { createShareSnapshot, isShareEnabled, type ShareKind, type SharePayload } from "@/lib/share";

const VALID_KINDS = new Set<ShareKind>(["reading", "ritual", "daily", "triplet", "session"]);

function isValidPayload(body: unknown): body is SharePayload {
  if (!body || typeof body !== "object") return false;
  const p = body as SharePayload;
  return (
    typeof p.title === "string" &&
    p.title.trim().length > 0 &&
    VALID_KINDS.has(p.kind) &&
    (p.excerpt == null || typeof p.excerpt === "string") &&
    (p.sessionId == null || typeof p.sessionId === "string") &&
    (p.historyId == null || typeof p.historyId === "string") &&
    (p.sourceType == null || typeof p.sourceType === "string") &&
    (p.cards == null || Array.isArray(p.cards))
  );
}

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  if (!(await isShareEnabled())) {
    return NextResponse.json({ error: "share_disabled" }, { status: 403 });
  }

  const auth = await requireUserAuth();
  const profileUserId = auth ? await getProfileUserIdForAccount(auth.sub) : null;
  const rateKey = profileUserId ?? clientIp(request);
  const limited = await enforceShareCreateRateLimit(rateKey);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await createShareSnapshot(body, profileUserId);
  if (!result) {
    return NextResponse.json({ error: "share_disabled" }, { status: 403 });
  }

  return NextResponse.json(result);
}
