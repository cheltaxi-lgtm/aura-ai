/**
 * B6 — forgotten discovery test: pause after discovery_max_days.
 */
import { adsQuery } from "../db";
import { getConfigJson } from "../config";
import { safetyPauseAll } from "./pause-all";

export async function runMaxDaysGuard(): Promise<{
  action: "ok" | "pause";
  oldestDays: number | null;
}> {
  const maxDays = (await getConfigJson<number>("discovery_max_days")) || 45;
  const { rows } = await adsQuery<{ external_id: string; age_days: number }>(
    `SELECT external_id,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(synced_at, NOW()))) / 86400.0 AS age_days
     FROM ads.entity_snapshot
     WHERE level = 'campaign'
       AND COALESCE(status, '') NOT IN ('SUSPENDED', 'OFF', 'ARCHIVED')`
  );

  // Prefer created-like age from action_log push
  const pushed = await adsQuery<{ campaign_id: string; age_days: number }>(
    `SELECT payload_json->>'campaignId' AS campaign_id,
            EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 AS age_days
     FROM ads.action_log
     WHERE action = 'push_discovery_campaign'
       AND result_json->>'campaignId' IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 50`
  );

  let oldestDays: number | null = null;
  const overdue: number[] = [];

  for (const r of pushed.rows) {
    const days = Number(r.age_days);
    if (!Number.isFinite(days)) continue;
    oldestDays = oldestDays == null ? days : Math.max(oldestDays, days);
    if (days > maxDays) {
      const id = Number(r.campaign_id);
      if (id) overdue.push(id);
    }
  }

  // Fallback: any ON campaign older than max by synced_at proxy when no push log
  if (!overdue.length) {
    for (const r of rows) {
      const days = Number(r.age_days);
      if (!Number.isFinite(days)) continue;
      oldestDays = oldestDays == null ? days : Math.max(oldestDays, days);
    }
  }

  // Better age: use MIN(created) from click? Use entity first_seen via action_log result
  const ageRows = await adsQuery<{ id: string; days: number }>(
    `SELECT result_json->>'campaignId' AS id,
            EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400.0 AS days
     FROM ads.action_log
     WHERE action = 'push_discovery_campaign'
       AND result_json->>'campaignId' IS NOT NULL
     GROUP BY 1`
  );
  for (const r of ageRows.rows) {
    const days = Number(r.days);
    const id = Number(r.id);
    if (!id || !Number.isFinite(days)) continue;
    oldestDays = oldestDays == null ? days : Math.max(oldestDays, days);
    if (days > maxDays) overdue.push(id);
  }

  const uniq = [...new Set(overdue)];
  if (uniq.length) {
    await safetyPauseAll({
      reason: "max_days",
      code: "B6_MAX_DAYS",
      message: `Тест идёт слишком долго (>${maxDays} дн.)`,
      severity: "warning",
      campaignIds: uniq,
    });
    return { action: "pause", oldestDays };
  }
  return { action: "ok", oldestDays };
}
