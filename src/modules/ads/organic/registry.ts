/**
 * Upsert organic query registry from Webmaster + Wordstat + Metrika snapshots.
 */
import { adsQuery } from "../db";
import { computeOpportunityScore, isCommercialQuery, type OrganicStatus } from "./score";
import { matchExistingLanding } from "./landings";

export type OrganicQueryRow = {
  query: string;
  cluster: string | null;
  target_url: string | null;
  frequency: number | null;
  impressions: number;
  clicks: number;
  ctr: string | number | null;
  current_position: string | number | null;
  previous_position: string | number | null;
  delta: string | number | null;
  organic_traffic: number | null;
  opportunity_score: number;
  status: OrganicStatus;
  wordstat_rising: boolean;
  commercial: boolean;
  landing_match: boolean;
  updated_at: Date | string;
};

async function latestWebmasterDate(): Promise<string | null> {
  const { rows } = await adsQuery<{ d: string }>(
    `SELECT MAX(date)::text AS d FROM ads.webmaster_query_daily`
  );
  return rows[0]?.d || null;
}

export async function refreshOrganicRegistry(): Promise<{
  ok: boolean;
  upserted: number;
  error?: string;
}> {
  try {
    const date = await latestWebmasterDate();
    if (!date) {
      return { ok: true, upserted: 0, error: "webmaster_query_daily empty — sync Webmaster first" };
    }

    const wm = await adsQuery<{
      query: string;
      clicks: number;
      shows: number;
      position: string | number | null;
    }>(
      `SELECT query, clicks, shows, position
       FROM ads.webmaster_query_daily
       WHERE date = $1::date`,
      [date]
    );

    const prev = await adsQuery<{ query: string; position: string | number | null }>(
      `SELECT query, position FROM ads.webmaster_query_daily
       WHERE date = ($1::date - INTERVAL '1 day')`,
      [date]
    );
    const prevPos = new Map(prev.rows.map((r) => [r.query, r.position == null ? null : Number(r.position)]));

    let wordstatRising = new Set<string>();
    let freqByNorm = new Map<string, number>();
    try {
      const wr = await adsQuery<{ phrase: string; phrase_norm: string; shows: number }>(
        `SELECT phrase, phrase_norm, shows
         FROM ads.wordstat_phrase_point
         WHERE run_id = (
           SELECT id FROM ads.wordstat_run WHERE ok = TRUE ORDER BY fetched_at DESC LIMIT 1
         )`
      );
      for (const r of wr.rows) {
        freqByNorm.set(r.phrase_norm, r.shows);
        freqByNorm.set(r.phrase.toLowerCase(), r.shows);
      }
      const movers = await adsQuery<{ phrase_norm: string }>(
        `SELECT DISTINCT phrase_norm FROM ads.wordstat_phrase_point p
         JOIN ads.wordstat_run r ON r.id = p.run_id
         WHERE r.ok AND r.fetched_at >= NOW() - INTERVAL '14 days'`
      );
      // Rising: current shows > previous run shows for same norm
      const prevRun = await adsQuery<{ phrase_norm: string; shows: number }>(
        `SELECT phrase_norm, shows FROM ads.wordstat_phrase_point
         WHERE run_id = (
           SELECT id FROM ads.wordstat_run WHERE ok = TRUE
           ORDER BY fetched_at DESC OFFSET 1 LIMIT 1
         )`
      );
      const prevShows = new Map(prevRun.rows.map((r) => [r.phrase_norm, r.shows]));
      for (const r of wr.rows) {
        const before = prevShows.get(r.phrase_norm);
        if (before != null && r.shows > before * 1.15 && r.shows - before >= 50) {
          wordstatRising.add(r.phrase.toLowerCase());
          wordstatRising.add(r.phrase_norm);
        }
      }
      void movers;
    } catch {
      /* wordstat tables optional */
    }

    let organicVisits = new Map<string, number>();
    try {
      const snap = await adsQuery<{ payload_json: { searchPhrases?: { phrase: string; visits: number }[] } }>(
        `SELECT payload_json FROM ads.source_snapshot WHERE source = 'metrika'`
      );
      for (const p of snap.rows[0]?.payload_json?.searchPhrases || []) {
        if (p.phrase) organicVisits.set(p.phrase.toLowerCase(), p.visits);
      }
    } catch {
      /* ignore */
    }

    let upserted = 0;
    for (const row of wm.rows) {
      const query = row.query.slice(0, 500);
      const key = query.toLowerCase();
      const impressions = row.shows || 0;
      const clicks = row.clicks || 0;
      const position = row.position == null ? null : Number(row.position);
      const previous = prevPos.get(row.query) ?? null;
      const delta =
        position != null && previous != null ? Number((previous - position).toFixed(2)) : null;
      const ctr = impressions > 0 ? clicks / impressions : null;
      const landing = matchExistingLanding(query);
      const frequency = freqByNorm.get(key) ?? freqByNorm.get(query) ?? null;
      const rising = wordstatRising.has(key);
      const commercial = isCommercialQuery(query);
      const scored = computeOpportunityScore({
        query,
        position,
        impressions,
        clicks,
        ctr,
        frequency,
        wordstatRising: rising,
        landingMatch: landing.landingMatch,
        commercial,
      });

      await adsQuery(
        `INSERT INTO ads.search_query_organic (
           query, cluster, target_url, frequency, impressions, clicks, ctr,
           current_position, previous_position, delta, organic_traffic,
           opportunity_score, status, wordstat_rising, commercial, landing_match, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()
         )
         ON CONFLICT (query) DO UPDATE SET
           cluster = EXCLUDED.cluster,
           target_url = EXCLUDED.target_url,
           frequency = EXCLUDED.frequency,
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           ctr = EXCLUDED.ctr,
           current_position = EXCLUDED.current_position,
           previous_position = EXCLUDED.previous_position,
           delta = EXCLUDED.delta,
           organic_traffic = EXCLUDED.organic_traffic,
           opportunity_score = EXCLUDED.opportunity_score,
           status = EXCLUDED.status,
           wordstat_rising = EXCLUDED.wordstat_rising,
           commercial = EXCLUDED.commercial,
           landing_match = EXCLUDED.landing_match,
           updated_at = NOW()`,
        [
          query,
          landing.cluster,
          landing.targetUrl,
          frequency,
          impressions,
          clicks,
          ctr,
          position,
          previous,
          delta,
          organicVisits.get(key) ?? null,
          scored.score,
          scored.status,
          rising,
          commercial,
          landing.landingMatch,
        ]
      );

      await adsQuery(
        `INSERT INTO ads.search_position_history
           (query, captured_at, position, impressions, clicks, ctr)
         VALUES ($1, $2::date, $3, $4, $5, $6)
         ON CONFLICT (query, captured_at) DO UPDATE SET
           position = EXCLUDED.position,
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           ctr = EXCLUDED.ctr`,
        [query, date, position, impressions, clicks, ctr]
      );
      upserted++;
    }

    await measureSeoExperiments();
    return { ok: true, upserted };
  } catch (e) {
    return {
      ok: false,
      upserted: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function measureSeoExperiments(): Promise<void> {
  try {
    const { rows } = await adsQuery<{
      id: string;
      query: string | null;
      url: string;
      applied_at: Date | string | null;
      position_before: string | number | null;
    }>(
      `SELECT id, query, url, applied_at, position_before
       FROM ads.seo_experiment
       WHERE applied_at IS NOT NULL AND (result IS NULL OR result = 'PENDING')`
    );
    for (const exp of rows) {
      if (!exp.query || !exp.applied_at) continue;
      const applied = new Date(exp.applied_at);
      const hist = await adsQuery<{ captured_at: Date | string; position: string | number | null; clicks: number; impressions: number; ctr: string | number | null }>(
        `SELECT captured_at, position, clicks, impressions, ctr
         FROM ads.search_position_history
         WHERE query = $1
         ORDER BY captured_at ASC`,
        [exp.query]
      );
      const atDays = (d: number) => {
        const target = applied.getTime() + d * 86400000;
        const hit = hist.rows.find((h) => Math.abs(new Date(h.captured_at).getTime() - target) <= 2 * 86400000);
        return hit?.position == null ? null : Number(hit.position);
      };
      const latest = hist.rows[hist.rows.length - 1];
      const ageDays = (Date.now() - applied.getTime()) / 86400000;
      await adsQuery(
        `UPDATE ads.seo_experiment SET
           position_3d = COALESCE($2, position_3d),
           position_7d = COALESCE($3, position_7d),
           position_14d = COALESCE($4, position_14d),
           position_30d = COALESCE($5, position_30d),
           clicks_after = COALESCE($6, clicks_after),
           impressions_after = COALESCE($7, impressions_after),
           ctr_after = COALESCE($8, ctr_after),
           result = CASE
             WHEN $9 >= 30 AND $5 IS NOT NULL THEN
               CASE WHEN $5 <= COALESCE(position_before, 99) THEN 'KEEP' ELSE 'ROLLBACK' END
             ELSE 'PENDING'
           END
         WHERE id = $1::uuid`,
        [
          exp.id,
          atDays(3),
          atDays(7),
          atDays(14),
          atDays(30),
          latest?.clicks ?? null,
          latest?.impressions ?? null,
          latest?.ctr ?? null,
          ageDays,
        ]
      );
    }
  } catch {
    /* experiments table may not exist */
  }
}

export async function listOrganicQueries(opts?: {
  status?: OrganicStatus;
  limit?: number;
}): Promise<OrganicQueryRow[]> {
  const status = opts?.status;
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const { rows } = await adsQuery<OrganicQueryRow>(
    status
      ? `SELECT * FROM ads.search_query_organic WHERE status = $1
         ORDER BY opportunity_score DESC, impressions DESC LIMIT $2`
      : `SELECT * FROM ads.search_query_organic
         ORDER BY opportunity_score DESC, impressions DESC LIMIT $1`,
    status ? [status, limit] : [limit]
  );
  return rows;
}

export async function listPositionHistory(query: string, days = 60) {
  const { rows } = await adsQuery(
    `SELECT captured_at, position, impressions, clicks, ctr
     FROM ads.search_position_history
     WHERE query = $1 AND captured_at >= CURRENT_DATE - $2::int
     ORDER BY captured_at ASC`,
    [query, days]
  );
  return rows;
}
