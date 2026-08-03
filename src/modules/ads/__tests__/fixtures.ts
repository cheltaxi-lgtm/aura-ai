import type { AdsBudget } from "../config";

export const DEFAULT_BUDGET_FOR_TESTS: AdsBudget = {
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
