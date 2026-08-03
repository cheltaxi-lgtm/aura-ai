/**
 * Safety pause/resume helpers — independent of rules flags.
 */
import { adsQuery } from "../db";
import { getConfigJson, setConfigJson } from "../config";
import { pauseCampaigns, resumeCampaigns, getCampaigns } from "../direct/campaigns";

export type PauseReason =
  | "budget_hard"
  | "freshness"
  | "landing"
  | "sync_stats"
  | "max_days"
  | "cpa"
  | "emergency"
  | "admin";

export async function listCampaignExternalIds(): Promise<number[]> {
  const { rows } = await adsQuery<{ external_id: string }>(
    `SELECT external_id FROM ads.entity_snapshot WHERE level='campaign'`
  );
  const fromDb = rows.map((r) => Number(r.external_id)).filter((n) => Number.isFinite(n) && n > 0);
  if (fromDb.length) return fromDb;
  try {
    const { result } = await getCampaigns();
    return (result?.Campaigns || [])
      .map((c) => c.Id)
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export async function safetyPauseAll(input: {
  reason: PauseReason;
  code: string;
  message: string;
  severity?: "warning" | "critical";
  campaignIds?: number[];
}): Promise<{ paused: number[] }> {
  const ids = input.campaignIds ?? (await listCampaignExternalIds());
  if (ids.length) {
    try {
      await pauseCampaigns(ids, { safetyPause: true });
    } catch (e) {
      await adsQuery(
        `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
         VALUES ('guard', 'safety_pause_failed', $1::jsonb, $2::jsonb)`,
        [
          JSON.stringify({ reason: input.reason, ids }),
          JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
        ]
      );
      throw e;
    }
    await adsQuery(
      `UPDATE ads.entity_snapshot
       SET status = 'SUSPENDED', pause_reason = $2, synced_at = NOW()
       WHERE level = 'campaign' AND external_id = ANY($1::text[])`,
      [ids.map(String), input.reason]
    );
  }

  if (input.reason === "landing") {
    const prev = (await getConfigJson<number[]>("guard.landing_paused_ids")) || [];
    await setConfigJson("guard.landing_paused_ids", [...new Set([...prev, ...ids])], "guard");
  }
  if (input.reason === "cpa") {
    const prev = (await getConfigJson<number[]>("guard.cpa_paused_ids")) || [];
    await setConfigJson("guard.cpa_paused_ids", [...new Set([...prev, ...ids])], "guard");
  }

  await adsQuery(
    `INSERT INTO ads.alert (severity, code, message, payload_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      input.severity || "critical",
      input.code,
      input.message,
      JSON.stringify({ reason: input.reason, ids }),
    ]
  );
  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ('guard', 'safety_pause', $1::jsonb, $2::jsonb)`,
    [
      JSON.stringify({ reason: input.reason, code: input.code }),
      JSON.stringify({ paused: ids }),
    ]
  );

  const status = (await getConfigJson<Record<string, unknown>>("guard.protection_status")) || {};
  status[input.reason] = {
    lastFiredAt: new Date().toISOString(),
    code: input.code,
    paused: ids.length,
  };
  await setConfigJson("guard.protection_status", status, "guard");

  return { paused: ids };
}

/** Resume only campaigns paused by landing health (never CPA-paused). */
export async function resumeLandingPaused(): Promise<{ resumed: number[] }> {
  const landing = (await getConfigJson<number[]>("guard.landing_paused_ids")) || [];
  const cpa = new Set((await getConfigJson<number[]>("guard.cpa_paused_ids")) || []);
  const ids = landing.filter((id) => !cpa.has(id));
  if (!ids.length) {
    await setConfigJson("guard.landing_paused_ids", [], "guard");
    return { resumed: [] };
  }
  try {
    await resumeCampaigns(ids);
  } catch (e) {
    await adsQuery(
      `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
       VALUES ('guard', 'landing_resume_failed', $1::jsonb, $2::jsonb)`,
      [
        JSON.stringify({ ids }),
        JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      ]
    );
    return { resumed: [] };
  }
  await adsQuery(
    `UPDATE ads.entity_snapshot
     SET status = 'ON', pause_reason = NULL, synced_at = NOW()
     WHERE level = 'campaign'
       AND external_id = ANY($1::text[])
       AND pause_reason = 'landing'`,
    [ids.map(String)]
  );
  await setConfigJson("guard.landing_paused_ids", [], "guard");
  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ('guard', 'landing_resume', $1::jsonb, $2::jsonb)`,
    [JSON.stringify({ ids }), JSON.stringify({ ok: true })]
  );
  return { resumed: ids };
}
