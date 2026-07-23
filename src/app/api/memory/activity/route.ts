import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) return NextResponse.json({ error: "profile_required" }, { status: 400 });

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_activity", auth.sub),
    180,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit", retryAfterSec }, { status: 429 });
  }

  const rawSource = request.nextUrl.searchParams.get("sourceEntityId")?.trim() ?? "";
  const sourceEntityId = UUID_RE.test(rawSource) ? rawSource : null;
  const { rows } = await query<{
    activity_id: string;
    fact_id: string;
    fact: string;
    category: string | null;
    event_date: string | null;
    source_type: string | null;
    source_entity_id: string | null;
    evidence_quote: string | null;
    created_at: Date | string;
  }>(
    `SELECT a.id AS activity_id, f.id AS fact_id, f.fact, f.category,
            f.event_date::text AS event_date, f.source_type,
            a.source_entity_id, f.evidence_quote, a.created_at
       FROM user_memory_activity a
       JOIN user_facts f ON f.id = a.fact_id AND f.user_id = a.user_id
      WHERE a.user_id = $1
        AND a.seen_at IS NULL
        AND a.activity_type = 'learned'
        AND f.status = 'active'
        AND ($2::uuid IS NULL OR a.source_entity_id = $2::uuid)
        AND a.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY a.created_at ASC
      LIMIT 8`,
    [userId, sourceEntityId]
  );
  return NextResponse.json({
    activities: rows.map((row) => ({
      id: row.activity_id,
      factId: row.fact_id,
      fact: row.fact,
      category: row.category,
      eventDate: row.event_date,
      sourceType: row.source_type,
      sourceEntityId: row.source_entity_id,
      evidenceQuote: row.evidence_quote,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === "string" && UUID_RE.test(id)).slice(0, 20)
    : [];
  if (!ids.length) return NextResponse.json({ ok: true, marked: 0 });
  const result = await query(
    `UPDATE user_memory_activity SET seen_at = NOW()
      WHERE user_id = $1 AND id = ANY($2::uuid[]) AND seen_at IS NULL`,
    [userId, ids]
  );
  return NextResponse.json({ ok: true, marked: result.rowCount ?? 0 });
}
