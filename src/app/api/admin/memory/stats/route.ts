import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb, query } from "@/lib/db";

/** Aggregated global-memory health snapshot for the admin dashboard. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const [facts, sessions, jobs] = await Promise.all([
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
    query<{
      pending: string;
      running: string;
      failed: string;
      completed_24h: string;
      stored_24h: string;
      grounding_rejected_24h: string;
      avg_lag_seconds: string | null;
      oldest_pending_seconds: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
         COUNT(*) FILTER (WHERE status = 'running')::text AS running,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COUNT(*) FILTER (
           WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'
         )::text AS completed_24h,
         COALESCE(SUM(stored_count) FILTER (
           WHERE completed_at > NOW() - INTERVAL '24 hours'
         ), 0)::text AS stored_24h,
         COALESCE(SUM(grounding_rejected_count) FILTER (
           WHERE completed_at > NOW() - INTERVAL '24 hours'
         ), 0)::text AS grounding_rejected_24h,
         AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (
           WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'
         )::text AS avg_lag_seconds,
         MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (
           WHERE status = 'pending'
         )::text AS oldest_pending_seconds
       FROM memory_extraction_jobs`
    ),
  ]);

  const f = facts.rows[0];
  const s = sessions.rows[0];
  const j = jobs.rows[0];
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
    extraction: {
      pending: n(j?.pending),
      running: n(j?.running),
      failed: n(j?.failed),
      completed24h: n(j?.completed_24h),
      stored24h: n(j?.stored_24h),
      groundingRejected24h: n(j?.grounding_rejected_24h),
      avgLagSeconds: Math.round(Number(j?.avg_lag_seconds ?? 0)),
      oldestPendingSeconds: Math.round(Number(j?.oldest_pending_seconds ?? 0)),
    },
  });
}
