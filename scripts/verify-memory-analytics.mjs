/**
 * Static privacy guard for memory product analytics.
 * This deliberately fails if free-form payload escape hatches are introduced.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
let failed = 0;
const assert = (name, condition) => {
  console.log(`${condition ? "[ok]" : "[fail]"} ${name}`);
  if (!condition) failed++;
};

const server = read("src/lib/memory/product-analytics.ts");
const client = read("src/lib/memory/memory-analytics.ts");
const route = read("src/app/api/metrics/memory/route.ts");
const admin = read("src/app/api/admin/memory/stats/route.ts");
const sources = [server, client, route];

const forbiddenKeys = [
  "content", "message", "messages", "evidence", "evidenceQuote", "factText",
  "memoryText", "promptText", "question", "answer", "email", "name", "url",
];
for (const key of forbiddenKeys) {
  const declaration = new RegExp(`\\b${key}\\??\\s*:`);
  assert(`analytics payload has no ${key} field`, sources.every((source) => !declaration.test(source)));
}

assert("event enum is closed", server.includes("MEMORY_PRODUCT_EVENTS") && server.includes("as const"));
assert("arbitrary properties are impossible", !client.includes("properties?:") && !route.includes("value.properties"));
assert(
  "database properties are numeric metrics only",
  server.includes("safeMetricsJson") &&
    server.includes("SAFE_METRIC_KEYS") &&
    server.includes("memory_candidates_count") &&
    !server.includes("factText")
);
assert("API requires authentication", route.includes("requireUserAuth()"));
assert("API validates session ownership", route.includes("sessions WHERE id = $1 AND user_id = $2"));
assert("API rate limits writes", route.includes("memory_product_analytics"));
assert("tokens are bounded", server.includes("{0,63}"));
assert("admin output is aggregate-only", !admin.includes("SELECT e.user_id") && !admin.includes("ua.email AS"));
assert("unlimited users are excluded", admin.includes("COALESCE(ua.is_unlimited, FALSE) = FALSE"));
assert("interpretation disclaims causality", admin.includes("not causal uplift estimates"));

if (failed) {
  console.error(`\n${failed} memory analytics privacy check(s) failed.`);
  process.exit(1);
}
console.log("\nMemory analytics privacy checks passed.");
