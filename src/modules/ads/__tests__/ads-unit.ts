/**
 * Ads Autopilot unit tests — run via `npx tsx src/modules/ads/__tests__/ads-unit.ts`
 * Exit 0 on all pass. Used by ads-verify V07–V11, V17–V25.
 */
import assert from "node:assert/strict";
import { DEFAULT_BUDGET_FOR_TESTS } from "./fixtures";
import {
  evaluateDiscoveryRules,
  ruleD1,
  ruleD2,
  ruleD5,
  discoveryExitCondition,
  type DiscoveryContext,
} from "../rules/discovery";
import { evaluateKillSwitch, ruleK1 } from "../rules/killswitch";
import { evaluateRomiRules } from "../rules/romi";
import { classifySearchQuery } from "../rules/search-queries";
import {
  validateCreative,
  validateKeyword,
  validateOptimizationGoal,
  DISCLAIMER_TAIL,
  getCompetitorBrandTerms,
} from "../validator";
import { processKeywords } from "../semantics/run";
import { computeEconomicsFromCohort } from "../economics";
import { buildOfflineConversionsCsv } from "../offline-conversions";
import { assertAdsMutationAllowed } from "../db";
import { requiresMoneyApproval } from "../approvals";
import {
  clearDirectWriteLog,
  getDirectWriteLog,
  directCall,
} from "../direct/client";

const budget = DEFAULT_BUDGET_FOR_TESTS;

function baseDisc(over: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return { budget, ...over };
}

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
  console.log("Ads unit tests");

  await test("V07 D1–D8 + little data → ok", () => {
    const empty = evaluateDiscoveryRules(baseDisc());
    assert.ok(empty.every((r) => r.decision === "ok"));
    assert.equal(ruleD1(baseDisc({ cpaRegistrationRub: 500 })).decision, "pause");
    assert.equal(ruleD1(baseDisc({ cpaRegistrationRub: 100 })).decision, "ok");
    assert.equal(ruleD2(baseDisc({ spendTodayRub: 301 })).applyPause, true);
    assert.equal(ruleD5(baseDisc({ spreadSubmitsTotal: 40, registrationsTotal: 0 })).applyPause, false);
    assert.equal(ruleD5(baseDisc({ spreadSubmitsTotal: 40, registrationsTotal: 0 })).decision, "alert");
  });

  await test("V07 K1–K4 kill-switch", () => {
    const kills = evaluateKillSwitch({
      budget,
      spendTodayRub: 999,
      spendTotalRub: 0,
      clicks24h: 0,
      registrations24h: 0,
      statsStaleHours: 1,
      metrikaStaleHours: 1,
    });
    assert.ok(kills.some((k) => k.rule === "K1" && k.applyPause));
    assert.equal(ruleK1({ budget, spendTodayRub: 100 }).decision, "ok");
  });

  await test("V08 classifier 9 rules + 18+ priority + brand never keyword", () => {
    const r1 = classifySearchQuery({ query: "таро для детей" });
    assert.equal(r1.rule, 1);
    assert.equal(r1.decision, "negative");
    const brands = getCompetitorBrandTerms();
    if (brands.length) {
      const r3 = classifySearchQuery({ query: `${brands[0]} онлайн` });
      assert.equal(r3.decision, "negative");
      assert.equal(r3.rule, 3);
      const kw = validateKeyword({ phrase: brands[0], freq: 500, mode: "discovery" });
      assert.equal(kw.ok, false);
    }
    assert.equal(
      classifySearchQuery({ query: "матрица судьбы", clicks: 20, deckViews: 0 }).rule,
      4
    );
    assert.equal(
      classifySearchQuery({
        query: "матрица судьбы",
        clicks: 30,
        deckViews: 5,
        spreadSubmits: 2,
        registrations: 0,
      }).rule,
      6
    );
    assert.equal(
      classifySearchQuery({
        query: "матрица судьбы онлайн",
        registrations: 1,
        inCore: false,
        landingExists: true,
      }).decision,
      "add_keyword"
    );
    assert.equal(
      classifySearchQuery({
        query: "матрица судьбы",
        firstPayments: 1,
      }).decision,
      "high_value"
    );
    assert.equal(
      classifySearchQuery({
        query: "новая ниша xyz",
        registrations: 1,
        landingExists: false,
      }).decision,
      "new_landing_approval"
    );
  });

  await test("V09 validator stop/len/disclaimer/whitelist/freq", () => {
    const bad = validateCreative({
      title: "Гарантия результата",
      text: "предскажем судьбу",
      href: "https://zovus.ru/matrix-destiny",
    });
    assert.equal(bad.ok, false);
    const good = validateCreative({
      title: "Матрица судьбы онлайн",
      title2: "Разбор",
      text: `Спокойный разбор. ${DISCLAIMER_TAIL}`,
      href: "https://zovus.ru/matrix-destiny",
    });
    assert.equal(good.ok, true, good.issues.map((i) => i.message).join("; "));
    assert.equal(validateKeyword({ phrase: "матрица судьбы", freq: 50, mode: "discovery" }).ok, false);
    assert.equal(validateKeyword({ phrase: "матрица судьбы", freq: 500, mode: "discovery" }).ok, true);
    assert.equal(validateCreative({
      title: "x",
      text: DISCLAIMER_TAIL,
      href: "https://evil.com/x",
    }).ok, false);
  });

  await test("V10 semantics degrade without Wordstat", () => {
    const rows = processKeywords([
      { phrase: "матрица судьбы онлайн", source: "seed", freqExact: null, freqPhrase: null },
    ]);
    assert.ok(rows.length >= 1);
    // Missing freq kept as pending (degraded) — not crash
    assert.ok(rows.some((r) => r.status === "pending" || r.status === "rejected"));
  });

  await test("V11 phrase without landing rejected from plan", () => {
    const rows = processKeywords([
      { phrase: "абракадабра xyzqqq", source: "seed", freqExact: 200, freqPhrase: 200 },
    ]);
    assert.ok(rows.every((r) => r.status === "rejected" && r.rejectReason === "no_landing"));
  });

  await test("V17 kill-switch synthetic over cap", () => {
    const r = ruleK1({ budget, spendTodayRub: budget.global_daily_cap_rub + 1 });
    assert.equal(r.applyPause, true);
  });

  await test("V18 forbidden optimization goals", () => {
    assert.equal(validateOptimizationGoal("deck_view").ok, false);
    assert.equal(validateOptimizationGoal("spread_submit").ok, false);
    assert.equal(validateOptimizationGoal("registration").ok, true);
  });

  await test("V19 economics synthetic cohort", () => {
    const e = computeEconomicsFromCohort({
      registrations: 200,
      payers: 40,
      revenueRub: 10000,
      targetRomi: 3,
    });
    assert.equal(e.sampleSize, 200);
    assert.equal(e.applyMaxAllowedCpa, true);
    assert.ok(e.maxAllowedCpaRegRub != null);
    assert.ok(Math.abs((e.arpuPerRegistrationRub || 0) - 50) < 0.01);
  });

  await test("V20 money increase → approval required", () => {
    assert.equal(
      requiresMoneyApproval({ kind: "budget_increase", current: 300, proposed: 500 }),
      true
    );
    assert.equal(
      requiresMoneyApproval({ kind: "budget_increase", current: 300, proposed: 200 }),
      false
    );
  });

  await test("V21 ROMI gated in discovery", () => {
    const r = evaluateRomiRules({
      budget: { ...budget, mode: "discovery" },
      mode: "discovery",
      romi: 0.1,
      drr: 10,
      spendTodayRub: 9999,
    });
    assert.ok(r.every((x) => x.decision === "ok"));
    assert.ok(r.every((x) => x.reason && (x.reason as { gated?: boolean }).gated));
  });

  await test("V22 D5 does not pause", () => {
    const d5 = ruleD5(baseDisc({ spreadSubmitsTotal: 100, registrationsTotal: 0 }));
    assert.equal(d5.applyPause, false);
    assert.notEqual(d5.decision, "pause");
  });

  await test("V23 exit creates mode_switch approval intent, no mode change", () => {
    const ex = discoveryExitCondition({
      registrationsTotal: 100,
      spendTotalRub: 0,
      targetRegistrations: 100,
      totalBudgetRub: 9000,
    });
    assert.equal(ex.triggered, true);
    assert.equal(ex.changeMode, false);
    assert.equal(ex.kind, "mode_switch");
  });

  await test("V24 spread_submit absent from offline CSV", () => {
    const csv = buildOfflineConversionsCsv([
      {
        id: "1",
        type: "spread_submit",
        amount_rub: null,
        occurred_at: new Date(),
        yclid: "y1",
        client_id: null,
      },
      {
        id: "2",
        type: "registration",
        amount_rub: null,
        occurred_at: new Date(),
        yclid: "y2",
        client_id: null,
      },
    ]);
    assert.ok(!csv.includes("spread_submit"));
    assert.ok(csv.includes("registration"));
  });

  await test("V25 sample_size < 100 → CPA threshold not applied", () => {
    const e = computeEconomicsFromCohort({
      registrations: 50,
      payers: 10,
      revenueRub: 2500,
      targetRomi: 3,
    });
    assert.equal(e.applyMaxAllowedCpa, false);
    assert.equal(e.maxAllowedCpaRegRub, null);
    assert.equal(e.confidence, "low");
  });

  await test("V05 DB guard rejects public INSERT", () => {
    assert.throws(() => assertAdsMutationAllowed("INSERT INTO users (id) VALUES (1)"));
    assert.doesNotThrow(() =>
      assertAdsMutationAllowed("INSERT INTO ads.click (id) VALUES ('x')")
    );
  });

  await test("V13 dry_run blocks Direct write log", async () => {
    const prev = process.env.ADS_RULES_MODE;
    const prevW = process.env.ADS_AUTOPILOT_WRITE;
    const prevA = process.env.ADS_ALLOW_DIRECT_WRITE;
    process.env.ADS_RULES_MODE = "dry_run";
    delete process.env.ADS_AUTOPILOT_WRITE;
    delete process.env.ADS_ALLOW_DIRECT_WRITE;
    process.env.ADS_DIRECT_TOKEN = process.env.ADS_DIRECT_TOKEN || "dummy";
    clearDirectWriteLog();
    try {
      await directCall("campaigns", "suspend", { SelectionCriteria: { Ids: [1] } }, { mutate: true });
      assert.fail("expected block");
    } catch (e) {
      assert.ok(String(e).includes("blocked") || String(e).includes("Direct"));
    }
    assert.equal(getDirectWriteLog().length, 0);
    if (prev !== undefined) process.env.ADS_RULES_MODE = prev;
    else delete process.env.ADS_RULES_MODE;
    if (prevW !== undefined) process.env.ADS_AUTOPILOT_WRITE = prevW;
    if (prevA !== undefined) process.env.ADS_ALLOW_DIRECT_WRITE = prevA;
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nAll ads unit tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
