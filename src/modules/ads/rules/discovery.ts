/**
 * Discovery-mode rules D1–D8 (pure functions).
 */
import type { AdsBudget } from "../config";

export type RuleDecision = {
  rule: string;
  decision: "ok" | "pause" | "alert" | "rotate_creative" | "lower_cpa" | "approval" | "autofix";
  applyPause?: boolean;
  alert?: { severity: "info" | "warning" | "critical"; code: string; message: string };
  reason?: Record<string, unknown>;
};

export type DiscoveryContext = {
  budget: AdsBudget;
  cpaRegistrationRub?: number | null;
  spendTodayRub?: number;
  spendTotalRub?: number;
  clicks24h?: number;
  deckViews24h?: number;
  spreadSubmitsTotal?: number;
  registrationsTotal?: number;
  moderationRejectedStreak?: number;
  impressions?: number;
  ctr?: number | null;
  /** True when validator produced a fixed creative for re-submit */
  autofixReady?: boolean;
  /** Anomalous CPA vs target — used by D8 */
  cpaAnomalyHigh?: boolean;
  proposedCpaIncrease?: boolean;
};

export function ruleD1(ctx: DiscoveryContext): RuleDecision {
  const cpa = ctx.cpaRegistrationRub;
  const max = ctx.budget.discovery_max_cpa_reg_rub;
  if (cpa != null && cpa > max) {
    return {
      rule: "D1",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "warning",
        code: "D1_CPA_MAX",
        message: `CPA(registration) ${cpa} > max ${max}`,
      },
      reason: { cpa, max },
    };
  }
  return { rule: "D1", decision: "ok" };
}

export function ruleD2(ctx: DiscoveryContext): RuleDecision {
  const spend = ctx.spendTodayRub ?? 0;
  const cap = ctx.budget.discovery_daily_cap_rub;
  if (spend > cap) {
    return {
      rule: "D2",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "warning",
        code: "D2_DAILY_CAP",
        message: `Daily spend ${spend} > discovery_daily_cap ${cap}`,
      },
      reason: { spend, cap },
    };
  }
  return { rule: "D2", decision: "ok" };
}

export function ruleD3(ctx: DiscoveryContext): RuleDecision {
  const spend = ctx.spendTotalRub ?? 0;
  const total = ctx.budget.discovery_total_budget_rub;
  if (spend >= total) {
    return {
      rule: "D3",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "D3_BUDGET_EXHAUSTED",
        message: "бюджет discovery исчерпан",
      },
      reason: { spend, total },
    };
  }
  return { rule: "D3", decision: "ok" };
}

export function ruleD4(ctx: DiscoveryContext): RuleDecision {
  const clicks = ctx.clicks24h ?? 0;
  const decks = ctx.deckViews24h ?? 0;
  if (clicks >= 50 && decks === 0) {
    return {
      rule: "D4",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "D4_LANDING_OR_TRACKING",
        message: "посадочная не работает или трекинг сломан",
      },
      reason: { clicks, decks },
    };
  }
  return { rule: "D4", decision: "ok" };
}

export function ruleD5(ctx: DiscoveryContext): RuleDecision {
  const spreads = ctx.spreadSubmitsTotal ?? 0;
  const regs = ctx.registrationsTotal ?? 0;
  if (spreads >= 30 && regs === 0) {
    return {
      rule: "D5",
      decision: "alert",
      applyPause: false,
      alert: {
        severity: "warning",
        code: "D5_TEASER_NO_REG",
        message: "тизер не конвертирует",
      },
      reason: { spreads, regs },
    };
  }
  return { rule: "D5", decision: "ok" };
}

export function ruleD6(ctx: DiscoveryContext): RuleDecision {
  const streak = ctx.moderationRejectedStreak ?? 0;
  if (streak >= 2) {
    return {
      rule: "D6",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "warning",
        code: "D6_MODERATION_DOUBLE",
        message: "два отклонения подряд",
      },
      reason: { streak },
    };
  }
  if (streak === 1 && ctx.autofixReady) {
    return { rule: "D6", decision: "autofix", reason: { streak } };
  }
  if (streak === 1) {
    return {
      rule: "D6",
      decision: "autofix",
      alert: {
        severity: "info",
        code: "D6_MODERATION_RETRY",
        message: "объявление отклонено — автофикс",
      },
      reason: { streak },
    };
  }
  return { rule: "D6", decision: "ok" };
}

export function ruleD7(ctx: DiscoveryContext): RuleDecision {
  const impressions = ctx.impressions ?? 0;
  const ctr = ctx.ctr;
  const min = ctx.budget.ctr_min;
  if (impressions > 500 && ctr != null && ctr < min) {
    return {
      rule: "D7",
      decision: "rotate_creative",
      reason: { impressions, ctr, min },
    };
  }
  return { rule: "D7", decision: "ok" };
}

export function ruleD8(ctx: DiscoveryContext): RuleDecision {
  if (ctx.proposedCpaIncrease) {
    return {
      rule: "D8",
      decision: "approval",
      reason: { note: "CPA increase requires approval_request" },
    };
  }
  if (ctx.cpaAnomalyHigh) {
    return {
      rule: "D8",
      decision: "lower_cpa",
      reason: { note: "auto lower CPA on anomaly" },
    };
  }
  return { rule: "D8", decision: "ok" };
}

const RULES = [ruleD1, ruleD2, ruleD3, ruleD4, ruleD5, ruleD6, ruleD7, ruleD8];

export function evaluateDiscoveryRules(ctx: DiscoveryContext): RuleDecision[] {
  return RULES.map((fn) => fn(ctx));
}

/**
 * Discovery exit: create mode_switch approval only — never mutates mode (V23).
 */
export function discoveryExitCondition(input: {
  registrationsTotal: number;
  spendTotalRub: number;
  targetRegistrations: number;
  totalBudgetRub: number;
}): { triggered: boolean; changeMode: false; kind: "mode_switch" } {
  const triggered =
    input.registrationsTotal >= input.targetRegistrations ||
    input.spendTotalRub >= input.totalBudgetRub;
  return { triggered, changeMode: false, kind: "mode_switch" };
}
