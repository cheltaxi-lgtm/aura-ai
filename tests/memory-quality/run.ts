/**
 * Deterministic Client Memory V3 quality harness.
 * Does not call a live LLM. Capture scores the production parse+grounding
 * pipeline against synthetic model JSON. Retrieval scores the production
 * assemble/serialize path against a lexical stand-in for searchFacts.
 */
import { datasetStats, loadGoldenDataset } from "./fixtures";
import {
  evalAuthority,
  evalBudget,
  evalCapture,
  evalCrossProductStatic,
  evalEntities,
  evalPerformance,
  evalRetrieval,
  evalTimeline,
} from "./evals";
import type { QualityFailure } from "./types";

function pct(num: number, den: number): number {
  if (den <= 0) return 100;
  return (num / den) * 100;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function main() {
  const dataset = loadGoldenDataset();
  const stats = datasetStats(dataset);
  const capture = evalCapture();
  const retrieval = evalRetrieval();
  const authority = evalAuthority();
  const entities = evalEntities();
  const timeline = evalTimeline();
  const cross = evalCrossProductStatic();
  const budget = evalBudget();
  const perf = evalPerformance();

  const capGold = capture.rows.reduce((s, r) => s + r.gold, 0);
  const capMatched = capture.rows.reduce((s, r) => s + r.matched, 0);
  const capExtracted = capture.rows.reduce((s, r) => s + r.extracted, 0);
  const capFalse = capture.rows.reduce((s, r) => s + r.falseFacts, 0);
  const predContam = capture.rows.reduce((s, r) => s + r.predictionContamination, 0);
  const entityRec = pct(
    capture.rows.reduce((s, r) => s + r.entityHit, 0),
    capture.rows.reduce((s, r) => s + r.entityGold, 0)
  );
  const dateRec = pct(
    capture.rows.reduce((s, r) => s + r.dateHit, 0),
    capture.rows.reduce((s, r) => s + r.dateGold, 0)
  );
  const predAcc = pct(
    capture.rows.reduce((s, r) => s + r.predicateHit, 0),
    capture.rows.reduce((s, r) => s + r.predicateGold, 0)
  );
  const sensitiveOk = pct(
    capture.rows.reduce((s, r) => s + r.sensitiveCorrect, 0),
    capture.rows.reduce((s, r) => s + r.sensitiveGold, 0)
  );

  const must = retrieval.rows.reduce((s, r) => s + r.must, 0);
  const mustHit = retrieval.rows.reduce((s, r) => s + r.mustHit, 0);
  const mustNot = retrieval.rows.reduce((s, r) => s + r.mustNot, 0);
  const mustNotV = retrieval.rows.reduce((s, r) => s + r.mustNotViolations, 0);
  const criticalMiss = retrieval.rows.reduce((s, r) => s + r.criticalMiss, 0);
  const manualMiss = retrieval.rows.reduce((s, r) => s + r.manualMiss, 0);
  const entityMiss = retrieval.rows.reduce((s, r) => s + r.entityMiss, 0);
  const timelineMiss = retrieval.rows.reduce((s, r) => s + r.timelineMiss, 0);
  const archivedMiss = retrieval.rows.reduce((s, r) => s + r.archivedMiss, 0);
  const irrHits = retrieval.rows.reduce((s, r) => s + r.irrelevantHits, 0);
  const irrDenom = retrieval.rows.filter((r) => r.mustNot > 0 && r.queryId).length;
  const irrQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.irrelevance))
  );
  const irrRate = pct(irrHits, Math.max(1, irrQueries.reduce((s, r) => s + r.mustNot, 0)));

  const criticalQueries = retrieval.rows.filter((r) => r.criticalMiss + r.must > 0 && dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.critical)));
  const criticalMust = criticalQueries.reduce((s, r) => s + r.must, 0);
  const criticalHit = criticalQueries.reduce((s, r) => s + r.mustHit, 0);

  const manualQueries = retrieval.rows.filter((r) => r.manualMust > 0);
  const entityQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.entity))
  );
  const timelineQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.timeline))
  );
  const archivedQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && (q.archived || q.expectArchivedRecovery)))
  );
  const crossMasterQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.crossMaster))
  );
  const crossProductQueries = retrieval.rows.filter((r) =>
    dataset.some((s) => s.queries.some((q) => q.id === r.queryId && q.crossProduct && q.mustInclude.length > 0))
  );

  const captureRecall = pct(capMatched, capGold);
  const capturePrecision = pct(capMatched, capMatched + capFalse);
  const retrievalRecall = pct(mustHit, must);
  const retrievalPrecision = pct(mustHit, mustHit + mustNotV);
  const manualRecall = pct(
    retrieval.rows.reduce((s, r) => s + r.manualHit, 0),
    retrieval.rows.reduce((s, r) => s + r.manualMust, 0)
  );
  const criticalRecall = pct(criticalHit, criticalMust);
  const entityRecall = pct(
    entityQueries.reduce((s, r) => s + r.mustHit, 0),
    entityQueries.reduce((s, r) => s + r.must, 0)
  );
  const timelineRecall = pct(
    timelineQueries.reduce((s, r) => s + r.mustHit, 0),
    timelineQueries.reduce((s, r) => s + r.must, 0)
  );
  const archiveRecall = pct(
    archivedQueries.reduce((s, r) => s + r.mustHit, 0),
    archivedQueries.reduce((s, r) => s + r.must, 0)
  );
  const crossMaster = pct(
    crossMasterQueries.reduce((s, r) => s + r.mustHit, 0),
    crossMasterQueries.reduce((s, r) => s + r.must, 0)
  );
  const crossProduct = pct(
    crossProductQueries.reduce((s, r) => s + r.mustHit, 0),
    crossProductQueries.reduce((s, r) => s + r.must, 0)
  );

  const timelineStateFails = retrieval.failures.filter((f) => f.gate === "timeline_correctness").length + timeline.length;
  const wrongPerson = [...entities, ...retrieval.failures].filter((f) => f.gate === "wrong_person").length;
  const manualOw = authority.filter((f) => f.gate === "manual_overwrite").length;
  const confirmedOw = authority.filter((f) => f.gate === "user_confirmed_overwrite").length;
  const leaks = [...cross, ...retrieval.failures].filter((f) => f.gate === "cross_user_leak").length;
  const budgetFails = budget.length + retrieval.rows.filter((r) => !r.securityPreserved).length;

  const allFailures: QualityFailure[] = [
    ...capture.failures,
    ...retrieval.failures,
    ...authority,
    ...entities,
    ...timeline,
    ...cross,
    ...budget,
  ];

  const gates: Array<{ name: string; ok: boolean; detail: string }> = [
    { name: "cross-user leak", ok: leaks === 0, detail: String(leaks) },
    { name: "manual overwrite", ok: manualOw === 0, detail: String(manualOw) },
    { name: "user-confirmed overwrite", ok: confirmedOw === 0, detail: String(confirmedOw) },
    { name: "prediction contamination", ok: predContam === 0, detail: String(predContam) },
    { name: "wrong-person retrieval", ok: wrongPerson === 0, detail: String(wrongPerson) },
    { name: "critical recall", ok: criticalRecall >= 100, detail: `${fmt(criticalRecall)}%` },
    { name: "manual recall", ok: manualRecall >= 100, detail: `${fmt(manualRecall)}%` },
    { name: "entity recall", ok: entityRecall >= 100, detail: `${fmt(entityRecall)}%` },
    { name: "timeline correctness", ok: timelineStateFails === 0 && timelineRecall >= 100, detail: `${fmt(timelineRecall)}% / ${timelineStateFails} state errors` },
    { name: "archived MUST_INCLUDE", ok: archiveRecall >= 100, detail: `${fmt(archiveRecall)}%` },
    { name: "general retrieval recall", ok: retrievalRecall >= 95, detail: `${fmt(retrievalRecall)}%` },
    { name: "irrelevant injection", ok: irrRate <= 5, detail: `${fmt(irrRate)}%` },
  ];

  const failedGates = gates.filter((g) => !g.ok);
  const pass = failedGates.length === 0;

  console.log("");
  console.log("MEMORY QUALITY SCORECARD");
  console.log("========================");
  console.log(
    `dataset: ${stats.scenarios} scenarios / ${stats.facts} facts / ${stats.turns} turns / ${stats.queries} queries`
  );
  console.log("");
  console.log(`Capture recall                 ${fmt(captureRecall)}%`);
  console.log(`Capture precision              ${fmt(capturePrecision)}%`);
  console.log(`  entity capture recall        ${fmt(entityRec)}%`);
  console.log(`  date capture recall          ${fmt(dateRec)}%`);
  console.log(`  predicate accuracy           ${fmt(predAcc)}%`);
  console.log(`  sensitive capture            ${fmt(sensitiveOk)}%`);
  console.log(`Manual recall                  ${fmt(manualRecall)}%`);
  console.log(`Critical recall                ${fmt(criticalRecall)}%`);
  console.log(`Entity recall                  ${fmt(entityRecall)}%`);
  console.log(`Timeline recall                ${fmt(timelineRecall)}%`);
  console.log(`Archive recall                 ${fmt(archiveRecall)}%`);
  console.log(`Cross-master                   ${fmt(crossMaster)}%`);
  console.log(`Cross-product                  ${fmt(crossProduct)}%`);
  console.log(`Irrelevant injection           ${fmt(irrRate)}%`);
  console.log(`Authority violations           ${manualOw + confirmedOw + authority.length}`);
  console.log(`Cross-user leaks               ${leaks}`);
  console.log(`Budget failures                ${budgetFails}`);
  for (const sample of perf.samples) {
    console.log(
      `p50/p95 retrieval @${sample.size}     ${sample.p50}ms / ${sample.p95}ms  cand=${sample.candidates} sel=${sample.selected} chars=${sample.chars}`
    );
  }
  console.log("");
  if (allFailures.length) {
    console.log(`FAILURES (${allFailures.length})`);
    for (const f of allFailures.slice(0, 40)) {
      console.log(`  [${f.gate}] ${f.detail}`);
    }
    if (allFailures.length > 40) console.log(`  … ${allFailures.length - 40} more`);
    console.log("");
  }
  console.log(pass ? "PASS" : "FAIL");
  if (!pass) {
    for (const g of failedGates) console.log(`  gate ${g.name}: ${g.detail}`);
  }
  void irrDenom;
  void capExtracted;
  process.exit(pass ? 0 : 1);
}

main();
