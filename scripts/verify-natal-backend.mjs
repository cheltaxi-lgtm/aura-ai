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
assert.match(interpretation, /generateValidatedNatalReport/);
assert.match(interpretation, /claimNatalInterpretationResilient/);

const timingRoute = read("src/app/api/natal-chart/timing/route.ts");
assert.match(timingRoute, /export const maxDuration = 300/);
assert.match(timingRoute, /isNatalChartEnabled/);
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
assert.match(forecast, /reportType = `forecast:\$\{horizon\}:\$\{timing\.windowStart\}`/);
assert.match(forecast, /generateValidatedNatalReport/);
assert.doesNotMatch(forecast, /buildMinimalNatalReport/);
assert.match(forecast, /Не удалось получить AI-прогноз/);
assert.match(forecast, /claimNatalInterpretationResilient/);
assert.match(forecast, /rollback\(\)/);
const generateValidated = read("src/lib/natal/generate-validated-report.ts");
assert.doesNotMatch(generateValidated, /falling back to evidence-grounded minimal report/);
assert.doesNotMatch(generateValidated, /buildMinimalNatalReport/);
assert.doesNotMatch(generateValidated, /accepted via soft salvage/);
assert.match(generateValidated, /generating section-by-section/);
assert.match(generateValidated, /allowReasoningFallback: forecast/);

const natalGenerator = read("src/lib/natal/generate-validated-report.ts");
assert.match(natalGenerator, /getNatalModel/);
assert.doesNotMatch(natalGenerator, /fallback: "minimal"/);
assert.match(natalGenerator, /editorialPass/);
assert.match(natalGenerator, /sanitizeNatalReport/);
assert.match(natalGenerator, /EVIDENCE_ID_RE/);
assert.doesNotMatch(natalGenerator, /skipCategoryRules:\s*true/);
assert.doesNotMatch(natalGenerator, /coerceEvidence:\s*true/);

const forecastEvidence = read("src/lib/natal/evidence.ts");
assert.match(forecastEvidence, /selectEvidenceForForecastPrompt/);
assert.match(forecastEvidence, /formatEvidencePromptCompact/);
assert.match(forecast, /selectEvidenceForForecastPrompt/);
assert.match(forecast, /formatEvidencePromptCompact/);

const natalEvidence = read("src/lib/natal/evidence.ts");
assert.match(natalEvidence, /options\.tradition === "vedic" \? null : options\.timing/);

const natalService = read("src/lib/services/natal-chart-service.ts");
assert.match(natalService, /deleteCurrentUserNatalReport/);
assert.match(natalService, /claimNatalInterpretationResilient/);
assert.match(natalService, /forceClearNatalInterpretationClaimKey/);
assert.match(natalService, /UPDATE private_report_shares[\s\S]*revoked_at/);
assert.match(natalService, /DELETE FROM natal_report_history/);
assert.match(natalService, /DELETE FROM natal_report_history[\s\S]*interpretationClaims/);
assert.match(natalService, /DELETE FROM natal_charts WHERE user_id/);
assert.match(natalService, /DELETE FROM natal_timing_cache WHERE user_id/);
assert.match(natalService, /getNatalChartClientView/);

const natalChartRoute = read("src/app/api/natal-chart/route.ts");
assert.match(natalChartRoute, /export async function DELETE/);
assert.match(natalChartRoute, /getNatalChartClientView/);
assert.doesNotMatch(natalChartRoute, /getOrComputeNatalChart/);

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
assert.match(compatibilityGenerate, /getNatalModel/);
assert.match(compatibilityGenerate, /modelOverride: natalModel/);
assert.match(compatibilityGenerate, /compatibilityChartsAreCurrent/);
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
assert.match(compatibilityService, /compatibilityChartsAreCurrent/);

const eventPreferences = read("src/app/api/natal-chart/event-preferences/route.ts");
assert.match(eventPreferences, /isNatalChartEnabled/);

const asyncJobs = read("src/lib/async-jobs.ts");
assert.match(asyncJobs, /natal_interpretation/);
assert.match(asyncJobs, /FOR UPDATE SKIP LOCKED/);
const asyncMigration = read("scripts/migrations/070_migrate_natal_async_jobs.sql");
assert.match(asyncMigration, /natal_compatibility/);
assert.match(asyncMigration, /attempt_count/);
assert.match(asyncMigration, /period_metadata/);
assert.match(asyncMigration, /billing_state/);
const asyncWorker = read("scripts/run-async-jobs.ts");
assert.match(asyncWorker, /endpointForJob|resolveWorkerKindsFromEnv/);
const asyncRegistry = read("src/lib/async-job-registry.ts");
assert.match(asyncRegistry, /natal_forecast/);
assert.match(asyncWorker, /WORKER_SECRET_HEADER/);
assert.match(asyncWorker, /ASYNC_JOB_WORKER_SECRET/);
const workerAuthShared = read("src/lib/async-job-worker-auth-shared.ts");
assert.match(workerAuthShared, /x-async-job-worker-secret/);
assert.match(workerAuthShared, /isDirectLoopbackWorkerCall/);

const astrologyWorkspace = read("src/components/natal/AstrologyWorkspace.tsx");
assert.match(astrologyWorkspace, /title="Персональный западный отчёт"/);
assert.match(astrologyWorkspace, /title="Персональный отчёт джйотиш"/);
assert.match(astrologyWorkspace, /title="Архив отчётов и прогнозов"/);
assert.match(astrologyWorkspace, /selectTab\("timing"\)/);
assert.match(astrologyWorkspace, /aura:natal-active-job/);
assert.match(astrologyWorkspace, /function isCurrentReport/);
assert.match(
  astrologyWorkspace,
  /report\.reportType === currentForecastType && matchesCurrentChart/
);
assert.match(astrologyWorkspace, /Новый прогноз на \$\{formatRuDateRange/);
assert.match(astrologyWorkspace, /onOpenArchive=\{openReportArchive\}/);
assert.doesNotMatch(astrologyWorkspace, /FORECAST_REPORT ·/);
assert.doesNotMatch(astrologyWorkspace, /Центр премиальных отчётов/);

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
const compatibilityPrivacyFix = read(
  "scripts/migrations/071_fix_natal_compatibility_snapshot_privacy.sql"
);
const compatibilityPrivacyPredicate = compatibilityPrivacyFix.split(
  "ADD CONSTRAINT natal_compatibility_snapshot_private"
)[1] ?? "";
assert.match(compatibilityPrivacyFix, /DROP CONSTRAINT IF EXISTS natal_compatibility_snapshot_private/);
assert.match(compatibilityPrivacyPredicate, /\$\.\*\*\.latitude/);
assert.doesNotMatch(compatibilityPrivacyPredicate, /\$\.\*\*\.longitude/);

console.log("Natal backend guardrails passed.");
