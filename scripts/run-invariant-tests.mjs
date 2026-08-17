#!/usr/bin/env node
/**
 * Run vitest invariants then always print the skip report.
 * Exit code follows vitest (failing P0 tests still fail preflight).
 *
 * Flake guard: on this Windows machine a vitest worker child process
 * occasionally dies mid-run with zero diagnostics (no exit-code trace, no
 * Event Log entry, no AV/OOM evidence — reproduced under both tinypool
 * (v3, ERR_IPC_CHANNEL_CLOSED) and vitest 4's built-in pool ("Worker exited
 * unexpectedly")). Test results themselves are deterministic. When the run
 * fails ONLY with that infra signature (no real test failures), retry once.
 * Real failures never trigger a retry.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = path.join(ROOT, "node_modules/vitest/vitest.mjs");

// pg DATE → JS Date shifts the calendar day under local UTC+ offsets when
// formatted with getUTC*. Pin UTC so Windows matches CI.
process.env.TZ = "UTC";

const INFRA_CRASH_RE = /Worker exited unexpectedly|ERR_IPC_CHANNEL_CLOSED/;
const REAL_FAILURE_RE = /\n *FAIL[ \t]|Failed Tests/;

function runVitest() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [vitestCli, "run", "tests/invariants", ...process.argv.slice(2)],
      { cwd: ROOT, env: { ...process.env, TZ: "UTC" } }
    );
    // Tee output: stream live AND keep a bounded tail for signature checks.
    let tail = "";
    const capture = (chunk, stream) => {
      stream.write(chunk);
      tail = (tail + chunk.toString()).slice(-262_144);
    };
    child.stdout.on("data", (c) => capture(c, process.stdout));
    child.stderr.on("data", (c) => capture(c, process.stderr));
    child.on("close", (code) => resolve({ code: code ?? 1, tail }));
  });
}

const first = await runVitest();
let code = first.code;

if (
  code !== 0 &&
  INFRA_CRASH_RE.test(first.tail) &&
  !REAL_FAILURE_RE.test(first.tail)
) {
  console.warn(
    "\n[invariants] worker process died with no test failures " +
      "(known local Windows flake) — retrying once.\n"
  );
  const retry = await runVitest();
  code = retry.code;
}

spawn(process.execPath, [path.join(ROOT, "scripts/preflight-report.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
}).on("close", () => {
  process.exit(typeof code === "number" ? code : 1);
});
