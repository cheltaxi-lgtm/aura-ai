#!/usr/bin/env node
/**
 * afterFileEdit: scoped verification hint; checks run once for the completed task.
 * Never runs typecheck/build/e2e. Fail-open.
 */
import fs from "node:fs";
import { PATH_SCOPES, SCOPES } from "../../scripts/ai-harness-catalog.mjs";
import { requiresVerification } from "../../scripts/ai-harness-fingerprint.mjs";


function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function fileFromInput(input) {
  return (
    input.file_path ||
    input.filePath ||
    input.path ||
    input.uri ||
    input.file ||
    ""
  );
}

function classify(rel) {
  const posix = String(rel).replace(/\\/g, "/");
  const scopes = PATH_SCOPES.filter((id) => SCOPES[id].paths.test(posix));
  return { posix, scopes };
}

try {
  const input = readStdin();
  const rel = fileFromInput(input);
  if (!rel || !requiresVerification(rel)) {
    process.stdout.write("{}\n");
    process.exit(0);
  }
  const { posix, scopes } = classify(rel);
  const isHarness = SCOPES.harness.paths.test(posix);
  const notes = [];

  if (scopes.length) {
    notes.push(
      `Zovus harness: edited ${posix} → scope ${scopes.join(",")}. After the task, run or reuse fresh results from \`node scripts/ai-harness.mjs --scope ${scopes[0]} --level fast\` (include all affected scopes; full when needed, production only when requested).`
    );
  } else if (isHarness) {
    notes.push("Zovus harness file changed. Run `npm run harness:selftest` before COMPLETED.");
  }

  if (notes.length) {
    process.stdout.write(`${JSON.stringify({ additional_context: notes.join("\n") })}\n`);
  } else {
    process.stdout.write("{}\n");
  }
} catch {
  process.stdout.write("{}\n");
}
process.exit(0);
