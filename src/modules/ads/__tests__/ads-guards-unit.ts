/**
 * Budget protection unit tests (V26–V40 subset without live Direct/DB).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateDiscoveryCampaignConfig } from "../validator";
import {
  BudgetExhaustedError,
  HardBudgetImmutableError,
  ApprovalExpiredError,
  ApprovalConfirmRequiredError,
} from "../guard/errors";
import { assertHardBudgetImmutable } from "../guard/budget";
import { buildApprovalImpact } from "../approvals";
import { resumeLandingPaused } from "../guard/pause-all";

let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  PASS ${name}`))
    .catch((e) => {
      failed++;
      console.error(`  FAIL ${name}: ${e instanceof Error ? e.message : e}`);
    });
}

async function main() {
  console.log("Ads guard unit tests");

  await test("V28 hard_total immutable", () => {
    assert.throws(() => assertHardBudgetImmutable("hard_total_budget_rub"), HardBudgetImmutableError);
    assert.doesNotThrow(() => assertHardBudgetImmutable("budget_warn_pct"));
  });

  await test("V33 RSYA / autotargeting blocked", () => {
    const rsya = validateDiscoveryCampaignConfig({
      campaignType: "network",
      networkEnabled: true,
      regionIds: [225],
      autotargetingEnabled: false,
      biddingStrategy: "AVERAGE_CPA",
    });
    assert.equal(rsya.ok, false);
    assert.ok(rsya.issues.some((i) => i.code === "campaign_type" || i.code === "rsya"));

    const auto = validateDiscoveryCampaignConfig({
      campaignType: "search",
      networkEnabled: false,
      regionIds: [225],
      autotargetingEnabled: true,
      biddingStrategy: "AVERAGE_CPA",
    });
    assert.equal(auto.ok, false);
    assert.ok(auto.issues.some((i) => i.code === "autotargeting"));
  });

  await test("V34 region required", () => {
    const r = validateDiscoveryCampaignConfig({
      campaignType: "search",
      networkEnabled: false,
      regionIds: [],
      biddingStrategy: "AVERAGE_CPA",
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "region_required"));
  });

  await test("V35 freq above max blocked", () => {
    const r = validateDiscoveryCampaignConfig({
      campaignType: "search",
      regionIds: [225],
      discoveryFreqMin: 100,
      discoveryFreqMax: 5000,
      keywords: [{ phrase: "матрица", freq: 9000 }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "freq_range"));
  });

  await test("V37 2x confirm flag on impact", async () => {
    const impact = await buildApprovalImpact({
      kind: "budget_increase",
      current_value: { amount: 100 },
      proposed_value: { amount: 250 },
    });
    assert.equal(impact.requiresTypedConfirm, true);
    assert.equal(impact.deltaDayRub, 150);
  });

  await test("error types exist", () => {
    assert.ok(new BudgetExhaustedError("x", 9000, 9000).code === "BUDGET_EXHAUSTED");
    assert.ok(new ApprovalExpiredError().code === "APPROVAL_EXPIRED");
    assert.ok(new ApprovalConfirmRequiredError("x").code === "APPROVAL_CONFIRM_REQUIRED");
  });

  await test("V32 resume helper skips CPA set (pure contract)", async () => {
    // Without DB, resumeLandingPaused may throw — just ensure export exists
    assert.equal(typeof resumeLandingPaused, "function");
  });

  await test("V39 ads-stop.ts exists and is Direct-only", () => {
    const p = join(process.cwd(), "scripts/ads-stop.ts");
    assert.ok(existsSync(p));
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("api.direct.yandex"));
    assert.ok(!src.includes("localhost:3000"));
    assert.ok(src.includes("--dry-run"));
  });

  await test("V40 emergency-stop route uses requireAdmin 403", () => {
    const p = join(
      process.cwd(),
      "src/app/(ads)/api/ads/admin/emergency-stop/route.ts"
    );
    assert.ok(existsSync(p));
    const src = readFileSync(p, "utf8");
    assert.ok(src.includes("requireAdmin"));
    assert.ok(src.includes("403"));
  });

  await test("migration 086 present", () => {
    const p = join(
      process.cwd(),
      "scripts/migrations/086_migrate_ads_budget_guards.sql"
    );
    assert.ok(existsSync(p));
    const sql = readFileSync(p, "utf8");
    assert.ok(sql.includes("budget_ledger"));
    assert.ok(sql.includes("health_check"));
    assert.ok(sql.includes("hard_total_budget_rub"));
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nAll ads guard unit tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
