#!/usr/bin/env node
/**
 * stop hook: block COMPLETED unless harness-state is a fresh PASS.
 * Fail-open: always exit 0 with valid JSON.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateStopGate } from "../../scripts/ai-harness-gate.mjs";
import { STATE_PATH } from "../../scripts/ai-harness-catalog.mjs";

function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function dirtyFiles() {
  const r = spawnSync("git", ["status", "--porcelain"], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    encoding: "utf8",
  });
  if (r.status !== 0) return [];
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function loadState(root) {
  const p = path.join(root, STATE_PATH);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

try {
  const input = readStdin();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const status = input.status || input.stop_status || "";
  const loopCount = Number(input.loop_count ?? input.loopCount ?? 0);
  const testMode = process.env.ZOVUS_HARNESS_SELFTEST === "1";
  const files = testMode && Array.isArray(input._test?.dirtyFiles) ? input._test.dirtyFiles : dirtyFiles();
  const state = testMode && input._test?.state !== undefined ? input._test.state : loadState(root);
  const result = evaluateStopGate({ status, loopCount, state, dirtyFiles: files });
  if (result.action === "block" && result.message) {
    process.stdout.write(`${JSON.stringify({ followup_message: result.message })}\n`);
  } else {
    process.stdout.write("{}\n");
  }
} catch {
  process.stdout.write("{}\n");
}
process.exit(0);
