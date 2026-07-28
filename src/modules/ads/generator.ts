/**
 * Discovery campaign generator — matrix-destiny cluster only.
 */
import { adsQuery } from "./db";
import { getBudget } from "./config";
import {
  DISCLAIMER_TAIL,
  validateCreative,
  validateKeyword,
  validateOptimizationGoal,
} from "./validator";
import { createApprovalRequest, requiresMoneyApproval } from "./approvals";
import { addTextCampaign } from "./direct/campaigns";
import { addAdGroup } from "./direct/adgroups";
import { addTextAd } from "./direct/ads";
import { addKeywords } from "./direct/keywords";

export type DiscoveryPlan = {
  cluster: "matrix-destiny";
  landingPath: "/matrix-destiny";
  optimizationGoal: "registration";
  dailyBudgetRub: number;
  targetCpaRegRub: number;
  strategyMode: "AVERAGE_CPA" | "MAX_CONVERSIONS_PRICE_CAP";
  keywords: { phrase: string; freq: number | null }[];
  creative: { title: string; title2: string; text: string; href: string };
  issues: string[];
  needsApproval?: {
    kind: "budget_increase" | "bid_increase" | "global_cap_increase";
    current: number;
    proposed: number;
  };
};

const BASE_URL = "https://zovus.ru";

export async function buildDiscoveryPlan(opts?: {
  keywords?: { phrase: string; freq?: number | null }[];
  dailyBudgetRub?: number;
  targetCpaRegRub?: number;
}): Promise<DiscoveryPlan> {
  const budget = await getBudget();
  const goalCheck = validateOptimizationGoal("registration");
  const issues: string[] = [];
  if (!goalCheck.ok) {
    issues.push(...goalCheck.issues.map((i) => i.message));
  }

  let keywords = opts?.keywords;
  if (!keywords) {
    const { rows } = await adsQuery<{
      phrase: string;
      freq_exact: number | null;
      freq_phrase: number | null;
    }>(
      `SELECT phrase, freq_exact, freq_phrase
       FROM ads.keyword_candidate
       WHERE status IN ('pending', 'approved')
         AND cluster_key = 'matrix-destiny'
         AND landing_path = '/matrix-destiny'
       ORDER BY created_at ASC
       LIMIT 50`
    );
    keywords = rows.map((r) => ({
      phrase: r.phrase,
      freq: r.freq_exact ?? r.freq_phrase,
    }));
  }

  const accepted: { phrase: string; freq: number | null }[] = [];
  for (const k of keywords || []) {
    const v = validateKeyword({
      phrase: k.phrase,
      freq: k.freq,
      mode: "discovery",
    });
    if (v.ok) accepted.push({ phrase: k.phrase, freq: k.freq ?? null });
    else issues.push(`keyword:${k.phrase}:${v.issues.map((i) => i.code).join(",")}`);
  }

  const title = "Матрица судьбы онлайн";
  const title2 = "Разбор по дате";
  // Text ≤81; disclaimer must remain intact as required tail
  const maxBody = Math.max(0, 81 - DISCLAIMER_TAIL.length - 1);
  const textBody = "Спокойный цифровой разбор.".slice(0, maxBody);
  const text = `${textBody} ${DISCLAIMER_TAIL}`.trim();
  const creative = {
    title: title.slice(0, 56),
    title2: title2.slice(0, 30),
    text: text.slice(0, 81),
    href: `${BASE_URL}/matrix-destiny`,
  };
  const cv = validateCreative(creative);
  if (!cv.ok) {
    issues.push(...cv.issues.map((i) => i.message));
  }

  const dailyBudgetRub = opts?.dailyBudgetRub ?? budget.campaign_daily_budget_rub;
  const targetCpaRegRub =
    opts?.targetCpaRegRub ?? budget.discovery_target_cpa_reg_rub;

  let needsApproval: DiscoveryPlan["needsApproval"];
  if (
    requiresMoneyApproval({
      kind: "budget_increase",
      current: budget.campaign_daily_budget_rub,
      proposed: dailyBudgetRub,
    })
  ) {
    needsApproval = {
      kind: "budget_increase",
      current: budget.campaign_daily_budget_rub,
      proposed: dailyBudgetRub,
    };
  } else if (
    requiresMoneyApproval({
      kind: "bid_increase",
      current: budget.discovery_target_cpa_reg_rub,
      proposed: targetCpaRegRub,
    })
  ) {
    needsApproval = {
      kind: "bid_increase",
      current: budget.discovery_target_cpa_reg_rub,
      proposed: targetCpaRegRub,
    };
  }

  return {
    cluster: "matrix-destiny",
    landingPath: "/matrix-destiny",
    optimizationGoal: "registration",
    dailyBudgetRub,
    targetCpaRegRub,
    strategyMode: "AVERAGE_CPA",
    keywords: accepted,
    creative,
    issues,
    needsApproval,
  };
}

/**
 * Push discovery campaign to Direct.
 * Money increases create approval_request and abort push.
 */
export async function pushDiscoveryCampaign(opts?: {
  plan?: DiscoveryPlan;
  dryRun?: boolean;
}): Promise<{
  ok: boolean;
  campaignId?: number;
  adGroupId?: number;
  approvalId?: string;
  reason?: string;
  strategyMode?: string;
}> {
  const plan = opts?.plan || (await buildDiscoveryPlan());
  if (plan.issues.length && !plan.keywords.length) {
    return { ok: false, reason: `validation: ${plan.issues.slice(0, 3).join("; ")}` };
  }
  const goal = validateOptimizationGoal(plan.optimizationGoal);
  if (!goal.ok) {
    return { ok: false, reason: goal.issues.map((i) => i.message).join("; ") };
  }
  const creativeOk = validateCreative(plan.creative);
  if (!creativeOk.ok) {
    return { ok: false, reason: creativeOk.issues.map((i) => i.message).join("; ") };
  }

  if (plan.needsApproval) {
    const approval = await createApprovalRequest({
      kind: plan.needsApproval.kind,
      targetLevel: "campaign",
      targetId: "discovery-matrix-destiny",
      currentValue: { amount: plan.needsApproval.current },
      proposedValue: { amount: plan.needsApproval.proposed },
      rationale: {
        note: "Money increase blocked — approval required before push",
        cluster: plan.cluster,
      },
    });
    return {
      ok: false,
      approvalId: approval.id,
      reason: "money_increase_requires_approval",
    };
  }

  if (opts?.dryRun) {
    return { ok: true, reason: "dry_run", strategyMode: plan.strategyMode };
  }

  let strategyMode: string = plan.strategyMode;
  let campaignId: number | undefined;
  try {
    const camp = await addTextCampaign({
      name: `ADS discovery ${plan.cluster}`,
      dailyBudgetRub: plan.dailyBudgetRub,
    });
    campaignId = camp.Id;
  } catch (e) {
    // Fallback strategy mode notation when AVERAGE_CPA unavailable
    strategyMode = "MAX_CONVERSIONS_PRICE_CAP";
    try {
      const camp = await addTextCampaign({
        name: `ADS discovery ${plan.cluster}`,
        dailyBudgetRub: plan.dailyBudgetRub,
      });
      campaignId = camp.Id;
    } catch (e2) {
      return {
        ok: false,
        reason: `direct_campaign: ${(e2 as Error).message || (e as Error).message}`,
      };
    }
  }

  if (!campaignId) {
    return { ok: false, reason: "campaign_id_missing" };
  }

  const ag = await addAdGroup({
    campaignId,
    name: plan.cluster,
    regionIds: [225],
  });
  const adGroupId = ag.Id;
  if (!adGroupId) {
    return { ok: false, campaignId, reason: "adgroup_id_missing" };
  }

  await addTextAd({
    adGroupId,
    title: plan.creative.title,
    title2: plan.creative.title2,
    text: plan.creative.text,
    href: plan.creative.href,
  });

  const phrases = plan.keywords.map((k) => k.phrase);
  if (phrases.length) {
    await addKeywords(adGroupId, phrases);
  }

  await adsQuery(
    `INSERT INTO ads.entity_snapshot
       (level, external_id, parent_id, name, status, daily_budget_rub, strategy_mode)
     VALUES ('campaign', $1, NULL, $2, 'ON', $3, $4)
     ON CONFLICT (level, external_id) DO UPDATE SET
       daily_budget_rub = EXCLUDED.daily_budget_rub,
       strategy_mode = EXCLUDED.strategy_mode,
       synced_at = NOW()`,
    [String(campaignId), `ADS discovery ${plan.cluster}`, plan.dailyBudgetRub, strategyMode]
  );

  if (phrases.length) {
    await adsQuery(
      `UPDATE ads.keyword_candidate
       SET status = 'pushed'
       WHERE normalized = ANY(
         SELECT lower(replace(unnest($1::text[]), 'ё', 'е'))
       )
       AND cluster_key = 'matrix-destiny'`,
      [phrases]
    );
  }

  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ('system', 'push_discovery_campaign', $1::jsonb, $2::jsonb)`,
    [
      JSON.stringify({ cluster: plan.cluster, keywords: phrases.length }),
      JSON.stringify({ campaignId, adGroupId, strategyMode }),
    ]
  );

  return { ok: true, campaignId, adGroupId, strategyMode };
}
