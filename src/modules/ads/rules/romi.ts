/**
 * ROMI / ДРР rules (R3, R4, K5) — gated: inactive while mode === 'discovery'.
 */
import type { AdsBudget } from "../config";
import type { RuleDecision } from "./discovery";

export type RomiContext = {
  budget: AdsBudget;
  /** Actual mode from config — discovery disables these rules */
  mode?: string;
  romi?: number | null;
  drr?: number | null;
  spendTodayRub?: number;
};

/** R3: ROMI below target → pause (post-discovery only). */
export function ruleR3(ctx: RomiContext): RuleDecision {
  if ((ctx.mode ?? ctx.budget.mode) === "discovery") {
    return { rule: "R3", decision: "ok", reason: { gated: true, mode: "discovery" } };
  }
  const romi = ctx.romi;
  const target = ctx.budget.target_romi;
  if (romi != null && romi < target) {
    return {
      rule: "R3",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "warning",
        code: "R3_ROMI_LOW",
        message: `ROMI ${romi} < target ${target}`,
      },
      reason: { romi, target },
    };
  }
  return { rule: "R3", decision: "ok" };
}

/** R4: ДРР (cost/revenue) too high → pause. */
export function ruleR4(ctx: RomiContext): RuleDecision {
  if ((ctx.mode ?? ctx.budget.mode) === "discovery") {
    return { rule: "R4", decision: "ok", reason: { gated: true, mode: "discovery" } };
  }
  const drr = ctx.drr;
  const maxDrr = 1 / Math.max(0.01, ctx.budget.target_romi);
  if (drr != null && drr > maxDrr) {
    return {
      rule: "R4",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "warning",
        code: "R4_DRR_HIGH",
        message: `ДРР ${drr} > max ${maxDrr}`,
      },
      reason: { drr, maxDrr },
    };
  }
  return { rule: "R4", decision: "ok" };
}

/** K5: post-discovery spend kill tied to ROMI model. */
export function ruleK5(ctx: RomiContext): RuleDecision {
  if ((ctx.mode ?? ctx.budget.mode) === "discovery") {
    return { rule: "K5", decision: "ok", reason: { gated: true, mode: "discovery" } };
  }
  const spend = ctx.spendTodayRub ?? 0;
  const cap = ctx.budget.global_daily_cap_rub;
  if (spend > cap) {
    return {
      rule: "K5",
      decision: "pause",
      applyPause: true,
      alert: {
        severity: "critical",
        code: "K5_POST_DISCOVERY_CAP",
        message: `spend ${spend} > global_daily_cap ${cap}`,
      },
      reason: { spend, cap },
    };
  }
  return { rule: "K5", decision: "ok" };
}

export function evaluateRomiRules(ctx: RomiContext): RuleDecision[] {
  return [ruleR3(ctx), ruleR4(ctx), ruleK5(ctx)];
}
