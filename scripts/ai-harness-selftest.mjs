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
import { parsePorcelain, validateCatalog } from "./ai-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

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

const passState = {
  verdict: "PASS",
  production: "NOT_REQUIRED",
  updatedAt: new Date().toISOString(),
  requiredChecks: ["guards"],
  checks: [{ id: "guards", status: "PASS" }],
};
check("gate allows PASS", completedAllowed(passState));

const failState = {
  ...passState,
  verdict: "FAIL",
  checks: [{ id: "guards", status: "FAIL", reason: "injected" }],
};
check("gate blocks FAIL", !completedAllowed(failState));

const noState = evaluateStopGate({
  status: "completed",
  dirtyFiles: ["src/lib/foo.ts"],
  state: null,
});
check("gate blocks missing run", noState.action === "block" && noState.reason === "no-state");

const qa = evaluateStopGate({ status: "completed", dirtyFiles: [], state: null });
check("gate allows Q&A stop", qa.action === "allow");

const partialState = { ...passState, verdict: "PARTIAL" };
check("gate blocks PARTIAL", !completedAllowed(partialState));

const stale = {
  ...passState,
  updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
};
check("gate blocks stale", !completedAllowed(stale));
check("work session includes package.json", isWorkSession(["package.json"]));
const lyingPass = {
  ...passState,
  requiredChecks: ["guards", "typecheck"],
  checks: [{ id: "guards", status: "PASS" }, { id: "typecheck", status: "FAIL" }],
};
check("gate blocks lying PASS", !completedAllowed(lyingPass));

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
check("injected FAIL blocks COMPLETED", !completedAllowed(injectedState));

const fixed = runNode("scripts/ai-harness.mjs", ["--scope", "harness", "--level", "fast", "--json"]);
check("retest after fix exits 0", fixed.status === 0, String(fixed.stderr || "").split("\n").slice(-1)[0]);
let fixedState = {};
try {
  fixedState = JSON.parse(fixed.stdout);
} catch {
  fixedState = {};
}
check("retest PASS", fixedState.verdict === "PASS");
check("retest allows COMPLETED", completedAllowed(fixedState));

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

const requiredAssets = [
  ".cursor/rules/zovus-ai-harness.mdc",
  ".cursor/skills/zovus-harness/SKILL.md",
  ".cursor/commands/audit-matrix.md",
  ".cursor/commands/full-audit.md",
  ".cursor/agents/harness-code-review.md",
  ".cursor/hooks.json",
  "docs/AI_HARNESS.md",
];
for (const rel of requiredAssets) {
  check(`asset ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}

const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/hooks.json"), "utf8"));
check("hooks.json has afterFileEdit", Array.isArray(hooksJson.hooks?.afterFileEdit));
check("hooks.json has stop", Array.isArray(hooksJson.hooks?.stop));

const npmScripts = Object.values(CHECKS).filter((c) => c.npm).map((c) => c.npm);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const name of npmScripts) {
  check(`npm script ${name}`, Boolean(pkg.scripts?.[name]));
}

const statePath = path.join(ROOT, STATE_PATH);
check("state file written", fs.existsSync(statePath));

if (failures.length) {
  console.error(`\nSELFTEST FAIL: ${failures.length} checks`);
  process.exit(1);
}
console.log("\nSELFTEST PASS");
