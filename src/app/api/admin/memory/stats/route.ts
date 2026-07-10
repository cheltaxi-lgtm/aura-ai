import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb, query } from "@/lib/db";

/** Aggregated global-memory health snapshot for the admin dashboard. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const [facts, sessions] = await Promise.all([
    query<{
      total: string;
      manual: string;
      critical: string;
      missing_embedding: string;
      distinct_users: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE source_character = 'user')::text AS manual,
         COUNT(*) FILTER (WHERE salience >= 5)::text AS critical,
         COUNT(*) FILTER (WHERE embedding IS NULL)::text AS missing_embedding,
         COUNT(DISTINCT user_id)::text AS distinct_users
       FROM user_facts`
    ),
    query<{ total: string; distinct_users: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(DISTINCT user_id)::text AS distinct_users
       FROM session_memories`
    ),
  ]);

  const f = facts.rows[0];
  const s = sessions.rows[0];
  const n = (v: string | undefined) => Number.parseInt(v ?? "0", 10);

  return NextResponse.json({
    facts: {
      total: n(f?.total),
      manual: n(f?.manual),
      auto: n(f?.total) - n(f?.manual),
      critical: n(f?.critical),
      missingEmbedding: n(f?.missing_embedding),
      distinctUsers: n(f?.distinct_users),
    },
    sessionMemories: {
      total: n(s?.total),
      distinctUsers: n(s?.distinct_users),
    },
  });
}
