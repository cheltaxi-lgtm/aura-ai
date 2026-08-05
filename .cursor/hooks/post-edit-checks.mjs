#!/usr/bin/env node
/**
 * afterFileEdit hook: run typecheck + guards (no build).
 * Fail-open: always exit 0 so edits are not blocked.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  readFileSync(0, "utf8");
} catch {
  /* no stdin */
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);

function run(script) {
  const r = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", script],
    { cwd: root, stdio: "inherit", shell: process.platform === "win32" }
  );
  return typeof r.status === "number" ? r.status : 1;
}

console.error("[hooks] afterFileEdit → typecheck + guards");
const tc = run("typecheck");
const gd = run("guards");
if (tc !== 0 || gd !== 0) {
  console.error(`[hooks] checks failed (typecheck=${tc} guards=${gd}) — not blocking edit`);
}
process.stdout.write("{}\n");
process.exit(0);
