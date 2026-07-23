import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { sanitizeTextField } from "@/lib/chat-sanitize";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  changeFact,
  confirmFact,
  deleteFact,
} from "@/lib/memory/user-facts";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_fact_action", auth.sub),
    60,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit", retryAfterSec }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const factId = typeof body.factId === "string" ? body.factId.trim() : "";
  const action = body.action;
  if (!factId || !["confirm", "change", "forget"].includes(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 422 });
  }

  if (action === "confirm") {
    const fact = await confirmFact(userId, factId);
    return fact
      ? NextResponse.json({ ok: true, fact })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (action === "forget") {
    const deleted = await deleteFact(userId, factId);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const nextFact = sanitizeTextField(body.fact, 400);
  const eventDate = sanitizeTextField(body.eventDate, 10) ?? null;
  if (!nextFact || nextFact.length < 6) {
    return NextResponse.json({ error: "invalid_fact" }, { status: 422 });
  }
  const fact = await changeFact(userId, factId, nextFact, eventDate);
  return fact
    ? NextResponse.json({ ok: true, fact })
    : NextResponse.json({ error: "change_failed" }, { status: 422 });
}
