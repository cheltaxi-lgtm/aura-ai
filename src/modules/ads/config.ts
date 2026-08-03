import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { adsQuery } from "./db";

export type AdsBudget = {
  mode: string;
  target_romi: number;
  discovery_daily_cap_rub: number;
  discovery_total_budget_rub: number;
  discovery_target_cpa_reg_rub: number;
  discovery_max_cpa_reg_rub: number;
  discovery_target_registrations: number;
  discovery_freq_min: number;
  discovery_freq_max: number;
  global_daily_cap_rub: number;
  campaign_daily_budget_rub: number;
  negative_min_clicks: number;
  rules_window_days: number;
  min_clicks_per_entity: number;
  approval_ttl_hours: number;
  ctr_min: number;
  cpa_start_kill_rub: number;
  cpa_reg_kill_rub: number;
  cpa_rune_kill_rub: number;
};

const DEFAULT_BUDGET: AdsBudget = {
  mode: "discovery",
  target_romi: 3,
  discovery_daily_cap_rub: 300,
  discovery_total_budget_rub: 9000,
  discovery_target_cpa_reg_rub: 150,
  discovery_max_cpa_reg_rub: 400,
  discovery_target_registrations: 100,
  discovery_freq_min: 100,
  discovery_freq_max: 5000,
  global_daily_cap_rub: 300,
  campaign_daily_budget_rub: 300,
  negative_min_clicks: 30,
  rules_window_days: 3,
  min_clicks_per_entity: 30,
  approval_ttl_hours: 48,
  ctr_min: 0.005,
  cpa_start_kill_rub: 100,
  cpa_reg_kill_rub: 250,
  cpa_rune_kill_rub: 500,
};

function loadYamlBudget(): Partial<AdsBudget> {
  try {
    const root = join(process.cwd());
    const path = join(root, "config/ads/budget.yaml");
    if (!existsSync(path)) return {};
    const yaml = require("yaml") as { parse: (s: string) => Record<string, unknown> };
    const raw = yaml.parse(readFileSync(path, "utf8")) || {};
    const out: Partial<AdsBudget> = {};
    for (const k of Object.keys(DEFAULT_BUDGET) as (keyof AdsBudget)[]) {
      if (typeof raw[k] === "number" || typeof raw[k] === "string") {
        (out as Record<string, unknown>)[k] = raw[k];
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function getConfigJson<T>(key: string): Promise<T | null> {
  try {
    const { rows } = await adsQuery<{ value_json: T }>(
      "SELECT value_json FROM ads.config WHERE key = $1",
      [key]
    );
    return rows[0]?.value_json ?? null;
  } catch {
    return null;
  }
}

export async function setConfigJson(
  key: string,
  value: unknown,
  updatedBy = "system"
): Promise<void> {
  // B1: hard_total_budget_rub is immutable via normal setters
  if (key === "hard_total_budget_rub") {
    const { HardBudgetImmutableError } = await import("./guard/errors");
    throw new HardBudgetImmutableError();
  }
  await adsQuery(
    `INSERT INTO ads.config (key, value_json, updated_at, updated_by)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json,
       updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy]
  );
}

export async function isAdsEnabled(): Promise<boolean> {
  if (process.env.ADS_ENABLED === "0" || process.env.ADS_ENABLED === "false") return false;
  if (process.env.ADS_ENABLED === "1" || process.env.ADS_ENABLED === "true") return true;
  const v = await getConfigJson<boolean>("ads.enabled");
  return v === true;
}

export async function isAdsRulesEnabled(): Promise<boolean> {
  const v = await getConfigJson<boolean>("ads.rules.enabled");
  return v === true;
}

export async function isAdsAutopilotWrite(): Promise<boolean> {
  const v = await getConfigJson<boolean>("ads.autopilot.write");
  return v === true;
}

/** Admin UI + read-only Yandex sync without enabling public beacon/spend. */
export async function isAdsObserve(): Promise<boolean> {
  if (process.env.ADS_OBSERVE === "0" || process.env.ADS_OBSERVE === "false") return false;
  if (process.env.ADS_OBSERVE === "1" || process.env.ADS_OBSERVE === "true") return true;
  const v = await getConfigJson<boolean>("ads.observe");
  // Default true so /admin/ads works before first toggle (migration 085 seeds true).
  return v !== false;
}

/** Admin routes / source sync: enabled OR observe. Public beacon still needs enabled. */
export async function canAccessAdsAdmin(): Promise<boolean> {
  if (await isAdsEnabled()) return true;
  return isAdsObserve();
}

export async function getBudget(): Promise<AdsBudget> {
  const fromDb = await getConfigJson<Partial<AdsBudget>>("budget");
  return { ...DEFAULT_BUDGET, ...loadYamlBudget(), ...(fromDb || {}) };
}

export function rulesMode(): "dry_run" | "apply" {
  const m = (process.env.ADS_RULES_MODE || "dry_run").toLowerCase();
  return m === "apply" ? "apply" : "dry_run";
}
