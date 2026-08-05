#!/usr/bin/env node
/**
 * Run vitest invariants then always print the skip report.
 * Exit code follows vitest (failing P0 tests still fail preflight).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = path.join(ROOT, "node_modules/vitest/vitest.mjs");

const vitest = spawnSync(
  process.execPath,
  [vitestCli, "run", "tests/invariants", ...process.argv.slice(2)],
  { cwd: ROOT, stdio: "inherit" }
);

spawnSync(process.execPath, [path.join(ROOT, "scripts/preflight-report.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});

const code = vitest.status;
process.exit(typeof code === "number" ? code : 1);
