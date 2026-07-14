import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const interpretation = read("src/app/api/natal-chart/interpretation/route.ts");
assert.match(interpretation, /export const maxDuration = 300/);
assert.match(interpretation, /getCachedPersonalTiming/);
assert.doesNotMatch(interpretation, /getOrComputePersonalTiming/);
assert.match(interpretation, /timeoutMs: 170_000[\s\S]*timeoutMs: 90_000/);

const timingRoute = read("src/app/api/natal-chart/timing/route.ts");
assert.match(timingRoute, /export const maxDuration = 300/);
assert.match(timingRoute, /TIMING_GENERATION_BUSY[\s\S]*status: 409/);

const timingService = read("src/lib/services/natal-timing-service.ts");
assert.match(timingService, /getCachedPersonalTiming/);
const busyBlock = timingService.match(/if \(claimed\.rowCount !== 1\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
assert.match(busyBlock, /TIMING_GENERATION_BUSY/);
assert.doesNotMatch(busyBlock, /existing\?\.timing_data/);

const cron = read("src/app/api/cron/natal-transits/route.ts");
assert.match(cron, /GENERATION_CONCURRENCY = 4/);
assert.match(cron, /getOrComputePersonalTiming\(row\.user_id, 7\)/);
assert.doesNotMatch(cron, /getOrComputePersonalTiming\(row\.user_id, (?:90|365)\)/);

for (const route of [
  "src/app/api/natal-chart/history/route.ts",
  "src/app/api/natal-chart/ai-preferences/route.ts",
]) {
  const source = read(route);
  assert.match(source, /isNatalChartEnabled/);
  assert.match(source, /enforcePaidRouteRateLimit/);
}

const shares = read("src/app/api/report-shares/route.ts");
assert.match(shares, /LEFT\(token, 8\) AS token_prefix/);
assert.match(shares, /tokenPrefix:/);
assert.doesNotMatch(shares, /id: row\.id, token: row\.token/);

const joint = read("src/lib/joint-reading-service.ts");
assert.match(joint, /combined_claim_token/);
assert.doesNotMatch(joint, /SET combined_reading = ''/);
assert.match(joint, /completion_notified_at IS NULL/);

const reportShare = read("src/lib/natal/report-share.ts");
assert.match(reportShare, /safe\?\.composite\?\.limitation/);

const migration = read("scripts/migrations/068_harden_natal_backend.sql");
assert.match(migration, /validate_private_report_share_target/);
assert.match(migration, /NATAL_READING/);
assert.match(migration, /FORECAST_REPORT/);

console.log("Natal backend guardrails passed.");
