/**
 * B1 — hard spend limit. Independent of rules/write flags.
 */
import { adsQuery } from "../db";
import { getConfigJson } from "../config";
import { BudgetExhaustedError, HardBudgetImmutableError } from "./errors";
import { safetyPauseAll } from "./pause-all";

export type BudgetGuardConfig = {
  hardTotalRub: number;
  warnPct: number;
};

export async function getHardBudgetConfig(): Promise<BudgetGuardConfig> {
  const hard = await getConfigJson<number>("hard_total_budget_rub");
  const warn = await getConfigJson<number>("budget_warn_pct");
  return {
    hardTotalRub: typeof hard === "number" ? hard : 9000,
    warnPct: typeof warn === "number" ? warn : 90,
  };
}

/** Refuse any programmatic mutation of hard_total_budget_rub. */
export function assertHardBudgetImmutable(key: string): void {
  if (key === "hard_total_budget_rub") {
    throw new HardBudgetImmutableError();
  }
}

export async function sumLedgerAndStats(): Promise<{
  spentRub: number;
  fromStats: number;
  fromRealtime: number;
}> {
  const stats = await adsQuery<{ s: string }>(
    `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats`
  );
  const fromStats = Number(stats.rows[0]?.s || 0);
  const today = new Date().toISOString().slice(0, 10);
  const statsToday = await adsQuery<{ s: string }>(
    `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats WHERE date = $1::date`,
    [today]
  );
  const st = Number(statsToday.rows[0]?.s || 0);
  const rt = await adsQuery<{ s: string }>(
    `SELECT COALESCE(MAX(cost_rub),0)::text AS s
     FROM ads.budget_ledger
     WHERE date = $1::date AND source = 'realtime_estimate'`,
    [today]
  );
  const fromRealtime = Number(rt.rows[0]?.s || 0);
  const todayBest = Math.max(st, fromRealtime);
  const spentRub = fromStats - st + todayBest;
  return { spentRub, fromStats, fromRealtime };
}

export async function recordBudgetLedger(input: {
  date: string;
  campaignId?: number;
  costRub: number;
  source: "direct_report" | "realtime_estimate";
}): Promise<void> {
  await adsQuery(
    `INSERT INTO ads.budget_ledger (date, campaign_id, cost_rub, source)
     VALUES ($1::date, $2, $3, $4)`,
    [input.date, input.campaignId ?? 0, input.costRub, input.source]
  );
}

export async function assertBudgetAvailable(extraCostRub = 0): Promise<void> {
  const { hardTotalRub } = await getHardBudgetConfig();
  const { spentRub } = await sumLedgerAndStats();
  if (spentRub + extraCostRub >= hardTotalRub) {
    throw new BudgetExhaustedError(
      `Hard budget exhausted: spent ${spentRub} + ${extraCostRub} ≥ ${hardTotalRub}`,
      spentRub,
      hardTotalRub
    );
  }
}

export async function runBudgetGuard(): Promise<{
  spentRub: number;
  hardTotalRub: number;
  pct: number;
  action: "ok" | "warn" | "pause";
}> {
  const { hardTotalRub, warnPct } = await getHardBudgetConfig();
  let spentRub = 0;
  let fromStats = 0;

  try {
    const s = await sumLedgerAndStats();
    spentRub = s.spentRub;
    fromStats = s.fromStats;
  } catch {
    /* schema may be mid-migrate */
  }

  try {
    const { fetchCustomReport } = await import("../direct/reports");
    const day = new Date().toISOString().slice(0, 10);
    const { csv } = await fetchCustomReport({
      dateFrom: day,
      dateTo: day,
      fieldNames: ["Date", "CampaignId", "Cost"],
    });
    let todayCost = 0;
    for (const line of csv.split(/\r?\n/)) {
      if (!line.trim() || /^(Date|Campaign|Адрес)/i.test(line)) continue;
      const p = line.split("\t");
      const cost = Number(String(p[p.length - 1] || "0").replace(",", ".")) || 0;
      todayCost += cost;
    }
    if (todayCost > 0) {
      await recordBudgetLedger({
        date: day,
        costRub: todayCost,
        source: "realtime_estimate",
      });
      const statsToday = await adsQuery<{ s: string }>(
        `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats WHERE date = $1::date`,
        [day]
      );
      const st = Number(statsToday.rows[0]?.s || 0);
      spentRub = fromStats - st + Math.max(st, todayCost);
    }
  } catch {
    /* Direct unavailable — freshness guard covers blindness */
  }

  const pct = hardTotalRub > 0 ? (spentRub / hardTotalRub) * 100 : 0;
  if (pct >= 100) {
    await safetyPauseAll({
      reason: "budget_hard",
      code: "B1_HARD_BUDGET",
      message: `Жёсткий лимит исчерпан: ${Math.round(spentRub)} / ${hardTotalRub} ₽`,
      severity: "critical",
    });
    return { spentRub, hardTotalRub, pct, action: "pause" };
  }
  if (pct >= warnPct) {
    await adsQuery(
      `INSERT INTO ads.alert (severity, code, message, payload_json)
       VALUES ('warning', 'B1_BUDGET_WARN', $1, $2::jsonb)`,
      [
        `Расход ${Math.round(pct)}% от hard_total (${Math.round(spentRub)} / ${hardTotalRub} ₽)`,
        JSON.stringify({ spentRub, hardTotalRub, pct }),
      ]
    );
    return { spentRub, hardTotalRub, pct, action: "warn" };
  }
  return { spentRub, hardTotalRub, pct, action: "ok" };
}

/** Apply hard_total only after approved global_cap_increase. */
export async function applyHardTotalFromApproval(
  approvalId: string,
  proposedRub: number
): Promise<void> {
  if (!(proposedRub > 0) || !Number.isFinite(proposedRub)) {
    throw new Error("invalid hard_total");
  }
  await adsQuery(
    `INSERT INTO ads.config (key, value_json, updated_at, updated_by)
     VALUES ('hard_total_budget_rub', $1::jsonb, NOW(), $2)
     ON CONFLICT (key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(proposedRub), `approval:${approvalId}`]
  );
}
