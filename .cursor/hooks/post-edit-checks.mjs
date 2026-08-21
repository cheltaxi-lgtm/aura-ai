#!/usr/bin/env node
/**
 * afterFileEdit: cheap hint + guards only for product source.
 * Never runs typecheck/build/e2e. Fail-open.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PATH_SCOPES, SCOPES } from "../../scripts/ai-harness-catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  if (!rel) {
    process.stdout.write("{}\n");
    process.exit(0);
  }
  const { posix, scopes } = classify(rel);
  const isSource = /\.(ts|tsx|js|mjs|cjs)$/.test(posix) && /^(src|telegram-bot\/src)\//.test(posix);
  const isHarness = SCOPES.harness.paths.test(posix);
  const notes = [];

  if (scopes.length) {
    notes.push(
      `Zovus harness: edited ${posix} → scope ${scopes.join(",")}. After the task run \`node scripts/ai-harness.mjs --scope ${scopes[0]} --level fast\` (full/production only if needed).`
    );
  } else if (isHarness) {
    notes.push("Zovus harness file changed. Run `npm run harness:selftest` before COMPLETED.");
  }

  if (isSource) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const r = spawnSync(npm, ["run", "guards"], {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if ((r.status ?? 1) !== 0) {
      notes.push("guards FAIL after this edit — fix before COMPLETED. Do not skip.");
    }
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
