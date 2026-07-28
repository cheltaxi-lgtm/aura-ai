import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getBudget,
  getConfigJson,
  isAdsAutopilotWrite,
  isAdsEnabled,
  isAdsRulesEnabled,
  rulesMode,
  setConfigJson,
  type AdsBudget,
} from "@/modules/ads/config";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadWhitelist(): string[] {
  try {
    const path = join(process.cwd(), "config/ads/landing-whitelist.yaml");
    if (!existsSync(path)) return [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yaml = require("yaml") as { parse: (s: string) => { paths?: string[] } };
    return yaml.parse(readFileSync(path, "utf8"))?.paths || [];
  } catch {
    return [];
  }
}

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const budget = await getBudget();
  return NextResponse.json({
    flags: {
      enabled: await isAdsEnabled(),
      rulesEnabled: await isAdsRulesEnabled(),
      autopilotWrite: await isAdsAutopilotWrite(),
      rulesMode: rulesMode(),
    },
    caps: {
      discovery_daily_cap_rub: budget.discovery_daily_cap_rub,
      discovery_total_budget_rub: budget.discovery_total_budget_rub,
      global_daily_cap_rub: budget.global_daily_cap_rub,
      campaign_daily_budget_rub: budget.campaign_daily_budget_rub,
      discovery_max_cpa_reg_rub: budget.discovery_max_cpa_reg_rub,
      discovery_target_cpa_reg_rub: budget.discovery_target_cpa_reg_rub,
      mode: budget.mode,
    },
    whitelist: loadWhitelist(),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    flags?: {
      enabled?: boolean;
      rulesEnabled?: boolean;
      autopilotWrite?: boolean;
    };
    caps?: Partial<AdsBudget>;
  };

  if (body.flags) {
    if (typeof body.flags.enabled === "boolean") {
      await setConfigJson("ads.enabled", body.flags.enabled, auth.sub);
    }
    if (typeof body.flags.rulesEnabled === "boolean") {
      await setConfigJson("ads.rules.enabled", body.flags.rulesEnabled, auth.sub);
    }
    if (typeof body.flags.autopilotWrite === "boolean") {
      await setConfigJson("ads.autopilot.write", body.flags.autopilotWrite, auth.sub);
    }
  }

  if (body.caps && typeof body.caps === "object") {
    const budget = await getBudget();
    const next = { ...budget };
    const keys: (keyof AdsBudget)[] = [
      "discovery_daily_cap_rub",
      "discovery_total_budget_rub",
      "global_daily_cap_rub",
      "campaign_daily_budget_rub",
      "discovery_max_cpa_reg_rub",
      "discovery_target_cpa_reg_rub",
    ];
    for (const k of keys) {
      const v = body.caps[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        // Money increases must go through approvals — block ups here
        const cur = Number(budget[k]);
        if (v > cur) {
          return NextResponse.json(
            { error: "money_increase_requires_approval", key: k, current: cur, proposed: v },
            { status: 400 }
          );
        }
        (next as Record<string, unknown>)[k] = v;
      }
    }
    await setConfigJson("budget", next, auth.sub);
  }

  // Re-read enabled after possible disable
  const stillEnabled = await getConfigJson<boolean>("ads.enabled");
  if (stillEnabled === false && process.env.ADS_ENABLED !== "1" && process.env.ADS_ENABLED !== "true") {
    // settings write succeeded; subsequent GETs may 404
  }

  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "settings_update",
    payload: body,
    entityType: "ads_settings",
  });

  return NextResponse.json({ ok: true });
}
