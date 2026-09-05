import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { listMemoryContextReceipts } from "@/lib/memory/context-receipts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) return NextResponse.json({ receipts: [] });
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.json({ error: "invalid_session" }, { status: 422 });
  }
  const limit = await checkRateLimit(rateLimitKey("memory_context", auth.sub), 360, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limit", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  return NextResponse.json({ receipts: await listMemoryContextReceipts(userId, sessionId) }, { headers: { "Cache-Control": "private, no-store" } });
}
