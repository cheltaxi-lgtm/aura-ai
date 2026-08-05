#!/usr/bin/env node
/**
 * Print skipped invariant tests from a Vitest JSON report.
 * Informational only — does not change exit code.
 *
 * Usage: node scripts/preflight-report.mjs [path-to-vitest-report.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath =
  process.argv[2] ||
  path.join(ROOT, "tests/invariants/.vitest-report.json");

function collectSkipped(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectSkipped(item, out);
    return out;
  }
  const assertionResults = node.assertionResults || node.assertions;
  if (Array.isArray(assertionResults)) {
    for (const a of assertionResults) {
      const status = a.status || a.state;
      if (status === "skipped" || status === "pending" || a.skip === true) {
        out.push({
          title: a.fullName || a.title || a.name || "(unnamed)",
          reason:
            a.failureMessages?.[0] ||
            a.reason ||
            (process.env.TEST_DATABASE_URL
              ? "skipped (TODO / describe.skipIf)"
              : "нет TEST_DATABASE_URL"),
        });
      }
    }
  }
  for (const key of ["testResults", "tests", "suites", "children"]) {
    if (node[key]) collectSkipped(node[key], out);
  }
  return out;
}

function main() {
  if (!fs.existsSync(reportPath)) {
    console.log(
      "\n⚠ ИНВАРИАНТЫ НЕ ПРОВЕРЕНЫ: (нет JSON-репорта vitest — запустите test:invariants с --reporter=json)"
    );
    console.log(`   ожидался файл: ${path.relative(ROOT, reportPath)}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.log("\n⚠ ИНВАРИАНТЫ НЕ ПРОВЕРЕНЫ: не удалось прочитать vitest JSON report");
    console.log(`   ${err instanceof Error ? err.message : err}`);
    return;
  }

  const skipped = collectSkipped(data);
  if (skipped.length === 0) {
    console.log("\n✓ Все инварианты проверены");
    return;
  }

  console.log(`\n⚠ ИНВАРИАНТЫ НЕ ПРОВЕРЕНЫ: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  - ${s.title}`);
    console.log(`    причина: ${s.reason}`);
  }
}

main();
