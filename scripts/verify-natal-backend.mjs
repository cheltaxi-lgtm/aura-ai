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
  "src/app/api/natal-chart/history/[id]/route.ts",
  "src/app/api/natal-chart/ai-preferences/route.ts",
]) {
  const source = read(route);
  assert.match(source, /isNatalChartEnabled/);
  assert.match(source, /enforcePaidRouteRateLimit/);
}

const forecast = read("src/app/api/natal-chart/forecast/route.ts");
assert.match(forecast, /action: "FORECAST_REPORT"/);
assert.match(forecast, /reportType = `forecast:\$\{horizon\}`/);
assert.match(forecast, /validateNatalReport[\s\S]*"forecast"/);
assert.match(forecast, /rollback\(\)/);

const natalService = read("src/lib/services/natal-chart-service.ts");
assert.match(natalService, /deleteCurrentUserNatalReport/);
assert.match(natalService, /UPDATE private_report_shares[\s\S]*revoked_at/);
assert.match(natalService, /DELETE FROM natal_report_history/);
assert.match(natalService, /DELETE FROM natal_report_history[\s\S]*interpretationClaims/);

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
assert.match(reportShare, /sanitizeCompatibilityReportShare/);

const compatibilityGenerate = read(
  "src/app/api/natal-chart/compatibility/[id]/generate/route.ts"
);
assert.match(compatibilityGenerate, /aiDataUseAcknowledged !== true/);
assert.match(compatibilityGenerate, /action: "SYNASTRY_REPORT"/);
assert.match(compatibilityGenerate, /rollback\(\)/);
assert.match(compatibilityGenerate, /validateCompatibilityReport/);
assert.doesNotMatch(compatibilityGenerate, /JOINT_READING|joint_readings/);

const compatibilityManual = read(
  "src/app/api/natal-chart/compatibility/manual/route.ts"
);
const compatibilityInviteToken = read(
  "src/app/api/natal-chart/compatibility/token/[token]/route.ts"
);
assert.match(compatibilityManual, /partnerDataAuthorized !== true/);
assert.match(compatibilityInviteToken, /participantConsentAcknowledged !== true/);
assert.match(shares, /thirdPartyConsentAcknowledged !== true/);
assert.match(shares, /reportKind === "compatibility"[\s\S]*owner_user_id = \$2 LIMIT 1/);

const compatibilityService = read(
  "src/lib/services/natal-compatibility-service.ts"
);
assert.match(compatibilityService, /computeNatalChartRecord/);
assert.match(compatibilityService, /getOrComputeNatalChart/);
assert.match(compatibilityService, /sanitizeSynastryForClient/);
assert.match(compatibilityService, /invite_token_hash/);
assert.match(compatibilityService, /UPDATE private_report_shares[\s\S]*revoked_at/);
assert.doesNotMatch(compatibilityService, /birth_date|birth_time|birth_city/);
assert.doesNotMatch(compatibilityService, /joint_readings/);

for (const route of [
  "src/app/api/natal-chart/compatibility/route.ts",
  "src/app/api/natal-chart/compatibility/manual/route.ts",
  "src/app/api/natal-chart/compatibility/invite/route.ts",
  "src/app/api/natal-chart/compatibility/token/[token]/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/route.ts",
  "src/app/api/natal-chart/compatibility/[id]/generate/route.ts",
]) {
  const source = read(route);
  assert.match(source, /isNatalChartEnabled/);
  assert.match(source, /requireProfileUserId/);
  assert.match(source, /enforcePaidRouteRateLimit/);
}

const migration = read("scripts/migrations/068_harden_natal_backend.sql");
assert.match(migration, /validate_private_report_share_target/);
assert.match(migration, /NATAL_READING/);
assert.match(migration, /FORECAST_REPORT/);

const compatibilityMigration = read(
  "scripts/migrations/069_migrate_natal_compatibility.sql"
);
assert.match(compatibilityMigration, /CREATE TABLE IF NOT EXISTS natal_compatibility_reports/);
assert.match(compatibilityMigration, /SYNASTRY_REPORT/);
assert.match(compatibilityMigration, /report_kind IN \('natal', 'relationship', 'compatibility'\)/);
assert.doesNotMatch(compatibilityMigration, /ALTER TABLE joint_readings/);

console.log("Natal backend guardrails passed.");
