/**
 * Kill-switch K1–K4 — always evaluated (not gated by feature flags).
 */
import type { AdsBudget } from "../config";
import type { RuleDecision } from "./discovery";

export type KillSwitchContext = {
  budget: AdsBudget;
  spendTodayRub?: number;
  spendTotalRub?: number;
  clicks24h?: number;
  registrations24h?: number;
  /** Hours since last successful stats or Metrika sync */
  statsStaleHours?: number | null;
  metrikaStaleHours?: number | null;
};

export function ruleK1(ctx: KillSwitchContext): RuleDecision {
  const spend = ctx.spendTodayRub ?? 0;
  const cap = ctx.budget.global_daily_cap_rub;
  if (spend > cap) {
    return {
      rule: "K1",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "K1_GLOBAL_DAILY_CAP",
        message: `Daily spend ${spend} > global_daily_cap ${cap}`,
      },
      reason: { spend, cap },
    };
  }
  return { rule: "K1", decision: "ok" };
}

export function ruleK2(ctx: KillSwitchContext): RuleDecision {
  const stats = ctx.statsStaleHours;
  const metrika = ctx.metrikaStaleHours;
  const blind =
    (stats != null && stats > 48) || (metrika != null && metrika > 48);
  if (blind) {
    return {
      rule: "K2",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "K2_BLIND_FLIGHT",
        message: "статистика или Метрика недоступны > 48 ч",
      },
      reason: { statsStaleHours: stats, metrikaStaleHours: metrika },
    };
  }
  return { rule: "K2", decision: "ok" };
}

export function ruleK3(ctx: KillSwitchContext): RuleDecision {
  const clicks = ctx.clicks24h ?? 0;
  const regs = ctx.registrations24h ?? 0;
  if (clicks >= 50 && regs === 0) {
    return {
      rule: "K3",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "K3_CLICKS_NO_REG",
        message: "≥50 кликов за 24 ч при 0 registration",
      },
      reason: { clicks, regs },
    };
  }
  return { rule: "K3", decision: "ok" };
}

export function ruleK4(ctx: KillSwitchContext): RuleDecision {
  const spend = ctx.spendTotalRub ?? 0;
  const total = ctx.budget.discovery_total_budget_rub;
  if (spend >= total) {
    return {
      rule: "K4",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "K4_DISCOVERY_TOTAL",
        message: "накопленный расход ≥ discovery_total_budget_rub",
      },
      reason: { spend, total },
    };
  }
  return { rule: "K4", decision: "ok" };
}

export function evaluateKillSwitch(ctx: KillSwitchContext): RuleDecision[] {
  return [ruleK1(ctx), ruleK2(ctx), ruleK3(ctx), ruleK4(ctx)];
}
