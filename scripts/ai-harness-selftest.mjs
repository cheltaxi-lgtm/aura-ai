#!/usr/bin/env node
/**
 * Harness self-test: catalog, dry-run, COMPLETED gate, FAIL→fix→PASS loop.
 * Does not deploy and does not run product full/e2e suites.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, SCOPES, STATE_PATH } from "./ai-harness-catalog.mjs";
import { completedAllowed, evaluateStopGate, isWorkSession } from "./ai-harness-gate.mjs";
import { parsePorcelain, resolvePlan, validateCatalog, verdictOf } from "./ai-harness.mjs";
import { requiredReviewIds, workspaceFingerprint } from "./ai-harness-fingerprint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const allows = (state) => completedAllowed(state, state.diffFingerprint);
const originalState = fs.existsSync(path.join(ROOT, STATE_PATH)) ? fs.readFileSync(path.join(ROOT, STATE_PATH), "utf8") : null;

function check(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function runNode(rel, args) {
  return spawnSync(process.execPath, [path.join(ROOT, rel), ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

const catalog = await validateCatalog();
check("catalog-valid", catalog.status === 0, catalog.stdout.split("\n")[0]);

for (const scope of Object.keys(SCOPES)) {
  const dry = runNode("scripts/ai-harness.mjs", ["--scope", scope, "--level", "fast", "--dry-run", "--json"]);
  check(`dry-run ${scope}`, dry.status === 0, String(dry.stderr || "").slice(0, 80));
  if (dry.status === 0) {
    const plan = JSON.parse(dry.stdout);
    check(`dry-run ${scope} has checks`, Array.isArray(plan.checks) && plan.checks.length > 0);
  }
}

// Plan based on selected task changes without escalating ambiguity or UI edits to full audits.
for (const files of [[], ["README.md"], ["docs/matrix-engine.md", ".agents/skills/audit-matrix/SKILL.md"],
  [".agents/skills/audit-matrix/agents/openai.yaml", ".codex/agents/harness-code-review.toml"]]) {
  const plan = resolvePlan("auto", "full", files);
  check(`no product work for ${files.join(",") || "clean checkout"}`,
    plan.notRequired && !plan.checkIds.length && !plan.requiredReviews.length);
}
const unknownPlan = resolvePlan("auto", "fast", ["src/lib/unclassified-service.ts"]);
check("unknown runtime needs scope without full suite", !unknownPlan.notRequired &&
  unknownPlan.unscopedFiles.length === 1 && !unknownPlan.checkIds.length && !unknownPlan.scopes.includes("full"));
const mixedPlan = resolvePlan("auto", "fast", ["src/components/matrix/Diagram.tsx", "src/lib/unclassified-service.ts"]);
check("mixed known and unknown paths preserve missing scope", mixedPlan.scopes.includes("matrix") && mixedPlan.unscopedFiles.length === 1);
check("runtime text files retain verification", resolvePlan("auto", "fast", ["public/robots.txt"]).scopes.includes("seo"));
check("empty unverified plan cannot PASS", verdictOf([], false) === "PARTIAL");
check("documentation plan is NOT_REQUIRED", verdictOf([], false, true) === "NOT_REQUIRED");
const matrixUiPlan = resolvePlan("auto", "fast", ["src/components/matrix/Diagram.tsx"]);
check("matrix UI needs code and visual only", matrixUiPlan.requiredReviews.length === 2 &&
  matrixUiPlan.requiredReviews.includes("code") && matrixUiPlan.requiredReviews.includes("visual"));
const calcPlan = resolvePlan("auto", "fast", ["src/lib/numerology/destiny-matrix-v5.ts"]);
check("matrix engine retains calculation review", calcPlan.requiredReviews.includes("calc") && !calcPlan.requiredReviews.includes("visual"));
for (const file of ["src/lib/numerology/matrix-reducers.ts", "src/lib/numerology/matrix-compatibility.ts",
  "src/lib/numerology/constants.ts", "src/lib/numerology/matrix-calendar.ts", "src/lib/natal/geocode.ts",
  "src/lib/human-design/transits-week.ts", "src/lib/human-design/fingerprint.ts"]) {
  const plan = resolvePlan("auto", "fast", [file]);
  check(`calculation dependency selects calc review: ${file}`, plan.requiredReviews.includes("calc") && !plan.unscopedFiles.length);
}
const apiPlan = resolvePlan("matrix", "fast", ["src/app/api/matrix/route.ts"]);
check("matrix API retains security review", apiPlan.requiredReviews.includes("security") && !apiPlan.requiredReviews.includes("visual"));
const selectedHarness = resolvePlan("auto", "fast", ["scripts/ai-harness.mjs"]);
check("selected harness files do not select product reviews", selectedHarness.scopes.join() === "harness" && selectedHarness.requiredReviews.join() === "code");
check("executable Codex hooks retain harness verification", resolvePlan("auto", "fast", [".codex/hooks/completed-gate.mjs"]).checkIds.includes("harness-validate"));
const combinedPlan = resolvePlan("auto", "fast", ["src/lib/natal/compute.ts", "src/lib/human-design/calculate.ts", "src/lib/numerology/destiny-matrix-v5.ts", "scripts/ai-harness.mjs"]);
check("multiple scopes keep targeted union and harness checks", !combinedPlan.scopes.includes("full") &&
  combinedPlan.scopes.length === 4 && combinedPlan.checkIds.includes("harness-validate") && !combinedPlan.checkIds.includes("build"));
const auditPlan = resolvePlan("matrix", "full", [], { audit: true });
check("explicit product audit retains all product reviewers", SCOPES.matrix.reviews.every(id => auditPlan.requiredReviews.includes(id)));
const fullAudit = resolvePlan("full", "full", [], { audit: true });
check("local full audit excludes production review", !fullAudit.productionRequired && !fullAudit.requiredReviews.includes("production"));
const prodAudit = resolvePlan("full", "production", [], { audit: true });
check("production audit includes production review", prodAudit.productionRequired && prodAudit.requiredReviews.includes("production"));
for (const level of ["fast", "full"]) {
  const infraPlan = resolvePlan("auto", level, ["hosting/Caddyfile"]);
  check(`infrastructure ${level} stays local`, infraPlan.scopes.join() === "production" &&
    infraPlan.checkIds.includes("guards") && !infraPlan.productionRequired &&
    !infraPlan.checkIds.some(id => id.startsWith("prod-")) && !infraPlan.requiredReviews.includes("production"));
  for (const scope of Object.keys(SCOPES)) {
    check(`${scope} ${level} excludes live checks`, !resolvePlan(scope, level, []).checkIds.some(id => id.startsWith("prod-")));
  }
}
const infraProduction = resolvePlan("auto", "production", ["hosting/Caddyfile"]);
check("explicit production level retains infrastructure live checks", infraProduction.productionRequired &&
  infraProduction.checkIds.includes("prod-health") && infraProduction.checkIds.includes("prod-smoke") &&
  infraProduction.requiredReviews.includes("production"));
check("deployment paths alone do not force production reviewer", !requiredReviewIds(["hosting/Caddyfile"], false).includes("production"));
check("documentation filenames do not trigger security or calculation review", requiredReviewIds(["docs/billing-engine.md"]).length === 0);
let rejectedAutoAudit = false;
try { resolvePlan("auto", "full", [], { audit: true }); } catch { rejectedAutoAudit = true; }
check("audit requires explicit scope", rejectedAutoAudit);

const docsRun = runNode("scripts/ai-harness.mjs", ["--file", "docs/AI_HARNESS.md", "--json", "--no-state"]);
check("docs-only CLI exits successfully without PASS claim", docsRun.status === 0 && JSON.parse(docsRun.stdout).verdict === "NOT_REQUIRED");
const unknownRun = runNode("scripts/ai-harness.mjs", ["--file", "package.json", "--json", "--no-state"]);
const unknownState = JSON.parse(unknownRun.stdout);
check("unknown runtime CLI exits PARTIAL", unknownRun.status === 1 && unknownState.verdict === "PARTIAL" &&
  unknownState.checks.some(row => row.id === "scope-selection" && row.status === "PARTIAL"));
const selectedRun = runNode("scripts/ai-harness.mjs", ["--file", "scripts/ai-harness.mjs", "--file", "docs/AI_HARNESS.md", "--dry-run", "--json"]);
const selectedPlan = JSON.parse(selectedRun.stdout);
check("repeatable --file isolates task planning", selectedRun.status === 0 && selectedPlan.files.length === 2 &&
  selectedPlan.scopes.join() === "harness" && selectedPlan.requiredReviews.join() === "code");
const escapingFile = runNode("scripts/ai-harness.mjs", ["--file", "../outside.ts", "--dry-run"]);
check("--file rejects paths outside repository", escapingFile.status === 1);

const passState = {
  verdict: "PASS",
  production: "NOT_REQUIRED",
  updatedAt: new Date().toISOString(),
  diffFingerprint: "test-fingerprint",
  requiredReviews: ["code", "security"],
  reviews: { code: "PASS", security: "PASS" },
  reviewEvidence: Object.fromEntries(["code", "security"].map(id => [id, {
    result: "PASS", reviewedAt: new Date().toISOString(), diffFingerprint: "test-fingerprint",
  }])),
  requiredChecks: ["guards"],
  checks: [{ id: "guards", status: "PASS" }],
};
check("gate allows PASS", allows(passState));

const failState = {
  ...passState,
  verdict: "FAIL",
  checks: [{ id: "guards", status: "FAIL", reason: "injected" }],
};
check("gate blocks FAIL", !allows(failState));

const noState = evaluateStopGate({
  status: "completed",
  dirtyFiles: ["src/lib/foo.ts"],
  state: null,
});
check("gate blocks missing run", noState.action === "block" && noState.reason === "no-state");

const qa = evaluateStopGate({ status: "completed", dirtyFiles: [], state: null });
check("gate allows Q&A stop", qa.action === "allow");
check("gate allows docs-only stop without test state", evaluateStopGate({ status: "completed",
  dirtyFiles: ["docs/matrix.md", ".agents/skills/audit-matrix/SKILL.md"], state: null,
}).action === "allow");
for (const verdict of ["FAIL", "PARTIAL"]) {
  check(`clean checkout cannot bypass explicit audit ${verdict}`, evaluateStopGate({ status: "completed",
    dirtyFiles: [], state: { ...passState, audit: true, verdict }, currentFingerprint: passState.diffFingerprint,
  }).action === "block");
}
check("clean checkout cannot bypass stale explicit audit", evaluateStopGate({ status: "completed", dirtyFiles: [],
  state: { ...passState, audit: true, updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
  currentFingerprint: passState.diffFingerprint,
}).reason === "stale-state");
check("docs-only work cannot clear outstanding explicit audit failure", evaluateStopGate({ status: "completed",
  dirtyFiles: ["README.md"], state: { ...failState, audit: true },
}).action === "block");
check("explicit audit result still requires fresh review evidence", !allows({ ...passState, audit: true, reviewEvidence: {} }));
check("unknown runtime remains a work session", isWorkSession(["config/runtime.yaml"]));

const partialState = { ...passState, verdict: "PARTIAL" };
check("gate blocks PARTIAL", !allows(partialState));

const stale = {
  ...passState,
  updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
};
check("gate blocks stale", !allows(stale));
check("work session includes package.json", isWorkSession(["package.json"]));
const lyingPass = {
  ...passState,
  requiredChecks: ["guards", "typecheck"],
  checks: [{ id: "guards", status: "PASS" }, { id: "typecheck", status: "FAIL" }],
};
check("gate blocks lying PASS", !allows(lyingPass));

check("gate blocks explicit negative review", !allows({ ...passState, reviews: { code: "FAIL", security: "PASS" } }));
check("gate respects extra negative review", !allows({ ...passState, reviews: { ...passState.reviews, production: "FAIL" } }));
check("gate blocks PARTIAL review", !allows({ ...passState, reviews: { code: "PASS", security: "PARTIAL" } }));
check("gate blocks missing review", !allows({ ...passState, reviews: { code: "PASS" } }));
check("gate blocks legacy unbound review", !allows({ ...passState, reviewEvidence: {} }));
check("gate blocks different reviewed diff", !allows({ ...passState, reviewEvidence: {
  ...passState.reviewEvidence, code: { ...passState.reviewEvidence.code, diffFingerprint: "old-diff" },
} }));
check("gate blocks post-test edit", !completedAllowed(passState, "edited-diff"));
check("review cannot renew old tests", !allows({ ...passState,
  updatedAt: new Date().toISOString(), checksCompletedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
}));
check("loop cap cannot bypass failure", evaluateStopGate({ status: "completed", loopCount: 3,
  dirtyFiles: ["src/x.ts"], state: failState, currentFingerprint: failState.diffFingerprint,
}).action === "block");

// Evidence must change when content changes, even if HEAD and file names do not.
fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
const fingerprintRepo = fs.mkdtempSync(path.join(ROOT, "tmp", "harness-fingerprint-"));
const fixtureGit = (...args) => {
  const result = spawnSync("git", args, { cwd: fingerprintRepo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Fingerprint fixture git failed: ${result.stderr}`);
};
fixtureGit("init", "--quiet");
fs.writeFileSync(path.join(fingerprintRepo, "source.ts"), "export const value = 1;\n");
fixtureGit("add", "source.ts");
fixtureGit("-c", "user.name=Harness Test", "-c", "user.email=harness@example.invalid", "commit", "--quiet", "-m", "test fixture");
const cleanFingerprint = workspaceFingerprint(fingerprintRepo);
fs.writeFileSync(path.join(fingerprintRepo, "source.ts"), "export const value = 2;\n");
const changedFingerprint = workspaceFingerprint(fingerprintRepo);
check("fingerprint catches content edit", changedFingerprint !== cleanFingerprint);
fs.writeFileSync(path.join(fingerprintRepo, "source.ts"), "export const value = 3;\n");
check("fingerprint catches second same-path edit", workspaceFingerprint(fingerprintRepo) !== changedFingerprint);
fs.writeFileSync(path.join(fingerprintRepo, "untracked.ts"), "export const pending = true;\n");
const withUntracked = workspaceFingerprint(fingerprintRepo);
fs.writeFileSync(path.join(fingerprintRepo, "untracked.ts"), "export const pending = false;\n");
check("fingerprint covers untracked contents", workspaceFingerprint(fingerprintRepo) !== withUntracked);

const hookFail = runNode(".cursor/hooks/completed-gate.mjs", []);
// completed-gate reads stdin; empty stdin must fail-open
check("completed-gate empty stdin fail-open", hookFail.status === 0);

check("porcelain space-prefixed", parsePorcelain(" M package.json") === "package.json");
check("porcelain untracked", parsePorcelain("?? scripts/ai-harness.mjs") === "scripts/ai-harness.mjs");

const hookBlock = spawnSync(process.execPath, [path.join(ROOT, ".cursor/hooks/completed-gate.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
  env: { ...process.env, ZOVUS_HARNESS_SELFTEST: "1" },
  input: JSON.stringify({
    status: "completed",
    loop_count: 0,
    _test: { dirtyFiles: ["src/lib/foo.ts"], state: failState },
  }),
});
let hookJson = {};
try {
  hookJson = JSON.parse(String(hookBlock.stdout || "").trim() || "{}");
} catch {
  hookJson = { parseError: hookBlock.stdout };
}
check(
  "completed-gate followup on FAIL",
  hookBlock.status === 0 && Boolean(hookJson.followup_message),
  hookJson.followup_message ? "followup set" : JSON.stringify(hookJson)
);

const injected = runNode("scripts/ai-harness.mjs", [
  "--scope",
  "harness",
  "--level",
  "fast",
  "--selftest-fail",
  "--no-state",
  "--json",
]);
check("injected FAIL exits 1", injected.status === 1);
let injectedState = {};
try {
  injectedState = JSON.parse(injected.stdout);
} catch {
  injectedState = {};
}
check("injected FAIL verdict", injectedState.verdict === "FAIL");
check("injected FAIL blocks COMPLETED", !allows(injectedState));

const fixed = runNode("scripts/ai-harness.mjs", ["--scope", "harness", "--level", "fast", "--json", "--no-state"]);
check("retest after fix exits 0", fixed.status === 0, String(fixed.stderr || "").split("\n").slice(-1)[0]);
let fixedState = {};
try {
  fixedState = JSON.parse(fixed.stdout);
} catch {
  fixedState = {};
}
check("retest PASS", fixedState.verdict === "PASS");
check("retest requires independent review", !allows(fixedState));
const reviewedFixed = { ...fixedState,
  reviews: Object.fromEntries(fixedState.requiredReviews.map(id => [id, "PASS"])),
  reviewEvidence: Object.fromEntries(fixedState.requiredReviews.map(id => [id, {
    result: "PASS", reviewedAt: new Date().toISOString(), diffFingerprint: fixedState.diffFingerprint,
  }])),
};
check("retest plus fresh reviews allows COMPLETED", allows(reviewedFixed));

const postEdit = spawnSync(process.execPath, [path.join(ROOT, ".cursor/hooks/post-edit-checks.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
  input: JSON.stringify({ file_path: "docs/AI_HARNESS.md" }),
});
check("post-edit skip docs", postEdit.status === 0);
let postJson = {};
try {
  postJson = JSON.parse(String(postEdit.stdout || "").trim() || "{}");
} catch {
  postJson = {};
}
check("post-edit returns JSON", typeof postJson === "object");

const session = spawnSync(process.execPath, [path.join(ROOT, ".cursor/hooks/session-start.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
  input: "{}",
});
check("session-start fail-open", session.status === 0);

const codexSession = spawnSync(process.execPath, [path.join(ROOT, ".codex/hooks/session-start.mjs")], {
  cwd: ROOT,
  encoding: "utf8",
  input: "{}",
});
check("codex session-start fail-open", codexSession.status === 0);

const requiredAssets = [
  ".cursor/rules/zovus-ai-harness.mdc",
  ".cursor/skills/zovus-harness/SKILL.md",
  ".cursor/commands/audit-matrix.md",
  ".cursor/commands/full-audit.md",
  ".cursor/agents/harness-code-review.md",
  ".cursor/hooks.json",
  ".codex/hooks.json",
  ".codex/hooks/session-start.mjs",
  "docs/AI_HARNESS.md",
];
for (const rel of requiredAssets) {
  check(`asset ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}

const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
check("hooks.json has afterFileEdit", Array.isArray(hooksJson.hooks?.afterFileEdit));
check("hooks.json has stop", Array.isArray(hooksJson.hooks?.stop));

const codexHooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".codex/hooks.json"), "utf8"));
const codexSessionCommand = String(codexHooksJson.hooks?.SessionStart?.[0]?.hooks?.[0]?.command || "");
check("codex hooks use repository-relative command", codexSessionCommand === "node .codex/hooks/session-start.mjs");
check("codex hooks do not contain an absolute Windows path", !/[A-Za-z]:[\\/]/.test(codexSessionCommand));

const npmScripts = Object.values(CHECKS).filter((c) => c.npm).map((c) => c.npm);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const name of npmScripts) {
  check(`npm script ${name}`, Boolean(pkg.scripts?.[name]));
}

const statePath = path.join(ROOT, STATE_PATH);
check("selftest preserves product state", originalState === (fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : null));

if (failures.length) {
  console.error(`\nSELFTEST FAIL: ${failures.length} checks`);
  process.exit(1);
}
console.log("\nSELFTEST PASS");
