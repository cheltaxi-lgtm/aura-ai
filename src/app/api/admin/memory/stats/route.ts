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

  const [facts, sessions, jobs, product, retention, cohorts] = await Promise.all([
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
    query<{
      eligible_users: string;
      prompt_users: string;
      activated_users: string;
      confirmed_facts: string;
      changed_facts: string;
      forgotten_facts: string;
      dismissed_facts: string;
      positive_feedback: string;
      negative_feedback: string;
      quiet_users: string;
      fresh_users: string;
      injection_events: string;
      injection_users: string;
    }>(
      `WITH eligible AS (
         SELECT e.*
           FROM memory_product_events e
           JOIN user_accounts ua ON ua.profile_user_id = e.user_id
          WHERE COALESCE(ua.is_unlimited, FALSE) = FALSE
            AND ua.email NOT ILIKE '%@example.%'
            AND ua.email NOT ILIKE '%@example.com'
            AND ua.email NOT ILIKE '%+test@%'
       )
       SELECT
         COUNT(DISTINCT user_id)::text AS eligible_users,
         COUNT(DISTINCT user_id) FILTER (WHERE event = 'consent_prompt_shown')::text AS prompt_users,
         COUNT(DISTINCT user_id) FILTER (WHERE event = 'consent_choice_enabled')::text AS activated_users,
         COUNT(*) FILTER (WHERE event = 'fact_confirmed')::text AS confirmed_facts,
         COUNT(*) FILTER (WHERE event = 'fact_changed')::text AS changed_facts,
         COUNT(*) FILTER (WHERE event = 'fact_forgotten')::text AS forgotten_facts,
         COUNT(*) FILTER (WHERE event = 'fact_dismissed')::text AS dismissed_facts,
         COUNT(*) FILTER (WHERE event = 'fact_feedback_positive')::text AS positive_feedback,
         COUNT(*) FILTER (WHERE event = 'fact_feedback_negative')::text AS negative_feedback,
         COUNT(DISTINCT user_id) FILTER (
           WHERE event = 'moments_mode_changed' AND moments_mode = 'quiet'
         )::text AS quiet_users,
         COUNT(DISTINCT user_id) FILTER (WHERE event = 'fresh_session_started')::text AS fresh_users,
         COUNT(*) FILTER (WHERE event = 'memory_injected')::text AS injection_events,
         COUNT(DISTINCT user_id) FILTER (WHERE event = 'memory_injected')::text AS injection_users
       FROM eligible`
    ),
    query<{
      cohort: "d7" | "d30";
      eligible: string;
      retained: string;
    }>(
      `WITH eligible_events AS (
         SELECT e.*
           FROM memory_product_events e
           JOIN user_accounts ua ON ua.profile_user_id = e.user_id
          WHERE COALESCE(ua.is_unlimited, FALSE) = FALSE
            AND ua.email NOT ILIKE '%@example.%'
            AND ua.email NOT ILIKE '%@example.com'
            AND ua.email NOT ILIKE '%+test@%'
       ), activation AS (
         SELECT user_id, MIN(created_at) AS activated_at
           FROM eligible_events
          WHERE event = 'consent_choice_enabled'
          GROUP BY user_id
       ), windows(cohort, start_day, end_day) AS (
         VALUES ('d7', 7, 14), ('d30', 30, 37)
       )
       SELECT w.cohort,
              COUNT(*) FILTER (
                WHERE a.activated_at <= NOW() - (w.end_day || ' days')::interval
              )::text AS eligible,
              COUNT(*) FILTER (
                WHERE a.activated_at <= NOW() - (w.end_day || ' days')::interval
                  AND EXISTS (
                    SELECT 1
                      FROM sessions s
                      JOIN chat_messages cm ON cm.session_id = s.id AND cm.role = 'user'
                     WHERE s.user_id = a.user_id
                       AND cm.created_at >= a.activated_at + (w.start_day || ' days')::interval
                       AND cm.created_at < a.activated_at + (w.end_day || ' days')::interval
                  )
              )::text AS retained
         FROM activation a CROSS JOIN windows w
        GROUP BY w.cohort ORDER BY w.cohort`
    ),
    query<{
      cohort_month: string;
      variant: string;
      sample_size: string;
      converted_users: string;
      revenue_rub: string;
      conversion_rate: string;
      arppu_rub: string;
      ltv_30d_rub: string;
    }>(
      `WITH activation AS (
         SELECT DISTINCT ON (e.user_id)
                e.user_id, e.account_id, e.created_at AS activated_at,
                COALESCE(e.variant, e.prompt_version, 'unassigned') AS variant
           FROM memory_product_events e
           JOIN user_accounts ua ON ua.profile_user_id = e.user_id
          WHERE e.event = 'consent_choice_enabled'
            AND COALESCE(ua.is_unlimited, FALSE) = FALSE
            AND ua.email NOT ILIKE '%@example.%'
            AND ua.email NOT ILIKE '%@example.com'
            AND ua.email NOT ILIKE '%+test@%'
          ORDER BY e.user_id, e.created_at
       ), cohort AS (
         SELECT *, date_trunc('month', activated_at)::date AS cohort_month
           FROM activation
          WHERE activated_at <= NOW() - INTERVAL '30 days'
       ), revenue_events AS (
         SELECT p.user_id, p.created_at, p.amount::numeric AS revenue
           FROM payments p
          WHERE p.status = 'succeeded' AND p.user_id IS NOT NULL
         UNION ALL
         SELECT rt.user_id, rt.created_at,
                CASE
                  WHEN rt.description ~ 'Пополнение на [0-9]+ ₽'
                    THEN ((regexp_match(rt.description, 'Пополнение на ([0-9]+) ₽'))[1])::numeric
                  ELSE COALESCE(rp.price_rub, 0)::numeric
                END AS revenue
           FROM rune_transactions rt
           LEFT JOIN rune_packages rp
             ON rt.description LIKE 'Пакет рун «' || rp.name || '»:%'
          WHERE rt.type = 'purchase'
       ), user_revenue AS (
         SELECT c.user_id, c.cohort_month, c.variant,
                COALESCE(SUM(r.revenue) FILTER (
                  WHERE r.created_at >= c.activated_at
                    AND r.created_at < c.activated_at + INTERVAL '30 days'
                ), 0) AS revenue
           FROM cohort c
           LEFT JOIN revenue_events r ON r.user_id = c.user_id
          GROUP BY c.user_id, c.cohort_month, c.variant
       )
       SELECT cohort_month::text, variant,
              COUNT(*)::text AS sample_size,
              COUNT(*) FILTER (WHERE revenue > 0)::text AS converted_users,
              ROUND(SUM(revenue), 2)::text AS revenue_rub,
              ROUND(100.0 * COUNT(*) FILTER (WHERE revenue > 0) / NULLIF(COUNT(*), 0), 2)::text
                AS conversion_rate,
              ROUND(SUM(revenue) / NULLIF(COUNT(*) FILTER (WHERE revenue > 0), 0), 2)::text
                AS arppu_rub,
              ROUND(SUM(revenue) / NULLIF(COUNT(*), 0), 2)::text AS ltv_30d_rub
         FROM user_revenue
        GROUP BY cohort_month, variant
        ORDER BY cohort_month DESC, variant
        LIMIT 60`
    ),
  ]);

  const f = facts.rows[0];
  const s = sessions.rows[0];
  const j = jobs.rows[0];
  const p = product.rows[0];
  const n = (v: string | undefined) => Number.parseInt(v ?? "0", 10);
  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;
  const retentionByName = new Map(retention.rows.map((row) => [row.cohort, row]));
  const positive = n(p?.positive_feedback);
  const negative = n(p?.negative_feedback);
  const eligibleUsers = n(p?.eligible_users);
  const promptUsers = n(p?.prompt_users);
  const activatedUsers = n(p?.activated_users);

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
    productAnalytics: {
      scope: {
        eligibleUsers,
        excludesUnlimitedAndTestAccounts: true,
        containsContentOrPii: false,
      },
      activation: {
        promptUsers,
        activatedUsers,
        ratePercent: ratio(activatedUsers, promptUsers),
      },
      feedback: {
        confirmed: n(p?.confirmed_facts),
        changed: n(p?.changed_facts),
        forgotten: n(p?.forgotten_facts),
        dismissed: n(p?.dismissed_facts),
        positive,
        negative,
        positivePercent: ratio(positive, positive + negative),
        sampleSize: positive + negative,
      },
      adoption: {
        quietUsers: n(p?.quiet_users),
        quietPercent: ratio(n(p?.quiet_users), eligibleUsers),
        freshUsers: n(p?.fresh_users),
        freshPercent: ratio(n(p?.fresh_users), eligibleUsers),
      },
      injection: {
        events: n(p?.injection_events),
        users: n(p?.injection_users),
      },
      retention: (["d7", "d30"] as const).map((name) => {
        const row = retentionByName.get(name);
        const eligible = n(row?.eligible);
        const retained = n(row?.retained);
        return { window: name, eligible, retained, ratePercent: ratio(retained, eligible) };
      }),
      commercialCohorts: cohorts.rows.map((row) => ({
        cohortMonth: row.cohort_month,
        variant: row.variant,
        sampleSize: n(row.sample_size),
        convertedUsers: n(row.converted_users),
        conversionRatePercent: Number(row.conversion_rate ?? 0),
        revenueRub: Number(row.revenue_rub ?? 0),
        arppuRub: Number(row.arppu_rub ?? 0),
        ltv30dRub: Number(row.ltv_30d_rub ?? 0),
      })),
      interpretation:
        "Observational correlation only. Variant comparisons are not causal uplift estimates.",
    },
  });
}
