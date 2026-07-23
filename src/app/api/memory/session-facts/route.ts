import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { canReadMemory } from "@/lib/memory/preferences";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { searchFacts } from "@/lib/memory/user-facts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context() {
  const auth = await requireUserAuth();
  if (!auth) return { error: NextResponse.json({ error: "auth_required" }, { status: 401 }) };
  if (!(await ensureDb())) {
    return { error: NextResponse.json({ error: "service_unavailable" }, { status: 503 }) };
  }
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) {
    return { error: NextResponse.json({ error: "profile_required" }, { status: 400 }) };
  }
  if (!(await canReadMemory(userId).catch(() => false))) {
    return { error: NextResponse.json({ error: "memory_disabled" }, { status: 409 }) };
  }
  return { auth, userId };
}

export async function GET(request: NextRequest) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "invalid_session" }, { status: 422 });
  }
  const queryText = request.nextUrl.searchParams.get("query")?.trim().slice(0, 500) ?? "";
  if (queryText.length < 8) return NextResponse.json({ facts: [] });
  const owned = await query<{ decision_count: string }>(
    `SELECT (
       SELECT COUNT(*)::text
         FROM session_memory_fact_decisions d
        WHERE d.session_id = s.id AND d.user_id = s.user_id
     ) AS decision_count
       FROM sessions s
      WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, ctx.userId]
  );
  if (!owned.rowCount) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (Number.parseInt(owned.rows[0]?.decision_count ?? "0", 10) >= 2) {
    return NextResponse.json({ facts: [] });
  }
  const relevant = await searchFacts(ctx.userId, queryText, { topK: 3 }).catch(() => []);
  if (!relevant.length) return NextResponse.json({ facts: [] });
  const { rows: decided } = await query<{ fact_id: string; decision: "included" | "excluded" }>(
    `SELECT fact_id, decision
       FROM session_memory_fact_decisions
      WHERE session_id = $1 AND user_id = $2 AND fact_id = ANY($3::uuid[])`,
    [sessionId, ctx.userId, relevant.map((fact) => fact.id)]
  );
  const decisions = new Map(decided.map((row) => [row.fact_id, row.decision]));
  return NextResponse.json({
    facts: relevant
      .filter((fact) => !decisions.has(fact.id))
      .slice(0, 1)
      .map((fact) => ({
        factId: fact.id,
        fact: fact.fact,
        category: fact.category,
        decision: null,
      })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  if (ctx.error) return ctx.error;
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_session_fact_decision", ctx.auth.sub),
    60,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit", retryAfterSec }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const factId = typeof body.factId === "string" ? body.factId.trim() : "";
  const decision = body.decision;
  if (
    !UUID_RE.test(sessionId) ||
    !UUID_RE.test(factId) ||
    (decision !== "included" && decision !== "excluded")
  ) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 422 });
  }
  const result = await query(
    `INSERT INTO session_memory_fact_decisions
       (session_id, user_id, fact_id, decision, updated_at)
     SELECT s.id, s.user_id, f.id, $4, NOW()
       FROM sessions s
       JOIN user_facts f ON f.id = $3 AND f.user_id = s.user_id AND f.status = 'active'
      WHERE s.id = $1 AND s.user_id = $2
     ON CONFLICT (session_id, fact_id) DO UPDATE
       SET decision = EXCLUDED.decision, updated_at = NOW()`,
    [sessionId, ctx.userId, factId, decision]
  );
  return (result.rowCount ?? 0) > 0
    ? NextResponse.json({ ok: true, decision })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
