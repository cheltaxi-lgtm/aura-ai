/**
 * Static checks for global memory relevance + governance policy.
 * Run: npx tsx scripts/verify-memory-policy.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error(`[fail] ${name}`);
    failed++;
  } else {
    console.log(`[ok] ${name}`);
  }
}

const buildMemoryContextSrc = read("src/lib/memory/build-memory-context.ts");
assert(
  "shared buildMemoryContext exists and composes query text",
  buildMemoryContextSrc.includes("export async function buildMemoryContext") &&
    buildMemoryContextSrc.includes("composeMemoryQueryText")
);
assert(
  "buildMemoryContext gates reads on canReadMemory",
  buildMemoryContextSrc.includes("canReadMemory")
);

const photoRoute = read("src/app/api/photo-reading/stream/route.ts");
assert(
  "photo-reading uses the shared memory-context helper (not hand-rolled blocks)",
  photoRoute.includes("buildMemoryContext") && photoRoute.includes("appendMemoryContextToPrompt")
);
assert(
  "photo-reading injects memory without requiring sessionId",
  photoRoute.includes("if (profileUserId)") &&
    !photoRoute.includes("if (profileUserId && resolvedSessionId)")
);

const dailyEnergy = read("src/lib/daily-energy.ts");
assert(
  "daily-energy uses shared memory-context helper",
  dailyEnergy.includes("buildMemoryContext") && dailyEnergy.includes("appendMemoryContextToPrompt")
);

const natalLens = read("src/lib/natal/personalization-lens.ts");
assert(
  "natal personalization lens uses buildMemoryContext",
  natalLens.includes("buildMemoryContext") && natalLens.includes("appendMemoryContextToPrompt")
);

assert(
  "past sessions load even without current sessionId (consent-gated)",
  buildMemoryContextSrc.includes("memoryOn && includePastSessions") &&
    !buildMemoryContextSrc.includes("userId && params.sessionId && includePastSessions")
);

const intentionSpreadRoute = read("src/app/api/intention-spread/route.ts");
assert(
  "intention-spread uses the shared memory-context helper",
  intentionSpreadRoute.includes("buildMemoryContext") &&
    intentionSpreadRoute.includes("appendMemoryContextToPrompt")
);

const readingRoute = read("src/app/api/reading/route.ts");
assert(
  "reading route uses the shared memory-context helper",
  readingRoute.includes("buildMemoryContext") && readingRoute.includes("appendMemoryContextToPrompt")
);
assert(
  "reading route does not double-inject session memory via the legacy formatter",
  /memory:\s*\[\]/.test(readingRoute)
);

const userFacts = read("src/lib/memory/user-facts.ts");
assert(
  "searchFacts empty query returns []",
  userFacts.includes("if (!trimmed) return [];")
);
assert(
  "purgeAllUserMemory revokes consent, clears jobs/reminders, keeps tombstones",
  userFacts.includes("purgeAllUserMemory") &&
    userFacts.includes("revokeMemoryConsent") &&
    userFacts.includes("purgeMemoryExtractionJobs") &&
    userFacts.includes("event_reminder") &&
    userFacts.includes("addTombstone") &&
    userFacts.includes("tombstonesAdded") &&
    !/purgeAllUserMemory[\s\S]*purgeTombstones/.test(userFacts)
);
assert(
  "fact lifecycle includes supersede/expire/tombstones",
  userFacts.includes("expireStaleFacts") &&
    userFacts.includes("addTombstone") &&
    userFacts.includes("status = 'active'")
);

const clientMemory = read("src/lib/memory/client-memory.ts");
assert(
  "loadClientMemoryBlock fail-closes on empty query (no unconditional event leak)",
  clientMemory.includes("if (!queryTrimmed)") && clientMemory.includes('return "";')
);
assert(
  "imminent events still require relevance (no unconditional bypass)",
  clientMemory.includes("IMMINENT_EVENT_DAYS") &&
    clientMemory.includes("isTextRelevantToQuery(queryTrimmed, f.fact)") &&
    !clientMemory.includes("days <= IMMINENT_EVENT_DAYS) return true;")
);
{
  const recordTurnSrc = clientMemory.slice(
    clientMemory.indexOf("export async function recordTurn"),
    clientMemory.indexOf("export async function processMemoryExtractionJobs")
  );
  assert(
    "recordTurn enqueues durable jobs (no in-request extract LLM)",
    recordTurnSrc.includes("enqueueMemoryExtraction") &&
      !recordTurnSrc.includes("extractFactsFromTurn")
  );
}
assert(
  "client memory serializes facts as untrusted XML",
  clientMemory.includes("memory_data") &&
    clientMemory.includes("false") &&
    clientMemory.includes("MEMORY_SECURITY_RULES") &&
    clientMemory.includes("escapeMemoryXml")
);

const preferences = read("src/lib/memory/preferences.ts");
assert(
  "memory preferences fail-closed by default",
  preferences.includes("memoryEnabled: false") &&
    preferences.includes("autoCaptureEnabled: false") &&
    preferences.includes("canReadMemory") &&
    preferences.includes("canAutoCapture")
);

const prefsRoute = read("src/app/api/memory/preferences/route.ts");
assert(
  "memory preferences API requires PD consent to enable",
  prefsRoute.includes("pdConsent") && prefsRoute.includes("consent_required")
);

const extractCron = read("src/app/api/cron/memory-extract/route.ts");
assert(
  "memory extraction cron drains processMemoryExtractionJobs",
  extractCron.includes("processMemoryExtractionJobs") && extractCron.includes("x-cron-secret")
);

const userMemory = read("src/lib/user-memory.ts");
assert(
  "buildMemoryBlock returns empty on empty query (no episodic leak)",
  userMemory.includes("if (!topicQuery) return \"\";") &&
    userMemory.includes("buildMemoryBlock")
);
assert(
  "past-session retrieval downranks sessions the client rated poorly (1-2)",
  userMemory.includes("outcome_rating IS NOT NULL AND outcome_rating <= 2")
);
assert(
  "buildClientBlock gates mainQuestion by relevance",
  userMemory.includes("isTextRelevantToQuery(query, profile.mainQuestion)")
);
assert(
  "buildClientBlock does not inject birthDate on empty query",
  userMemory.includes("Boolean(query)") &&
    userMemory.includes("/натал|астро|зодиак|гороскоп|нумеролог|матриц|даша|транзит|рожден/i")
);
assert(
  "buildCurrentSessionAnchorBlock rejects empty query",
  userMemory.includes("if (!topicQuery) return \"\";") &&
    userMemory.includes("buildRelevantSessionAnchor")
);

const orchestrator = read("src/lib/services/chat-orchestrator.ts");
assert(
  "chat-orchestrator filters LLM history",
  orchestrator.includes("filterLlmMessagesByTopic")
);

const relevance = read("src/lib/memory/memory-relevance.ts");
assert(
  "composeMemoryQueryText expands intention slug",
  relevance.includes("expandIntentionForQuery")
);
assert(
  "composeMemoryQueryText does not revive mainQuestion for short chat replies",
  relevance.includes("Short non-empty replies") &&
    relevance.includes("if (last.length > 0) return \"\";")
);

const adminMemory = read("src/app/api/admin/users/[userId]/memory/route.ts");
assert(
  "admin memory API has no GET (no content exposure)",
  !adminMemory.includes("export async function GET") &&
    !adminMemory.includes("listFacts") &&
    !adminMemory.includes("listSessionMemoriesForUser")
);
assert(
  "admin memory API can purge without reading content",
  adminMemory.includes("purgeAllUserMemory") && adminMemory.includes("export async function DELETE")
);

const adminPage = read("src/app/admin/users/page.tsx");
assert(
  "admin UI has purge-only memory control",
  adminPage.includes("Очистить память") &&
    adminPage.includes("purgeUserMemory") &&
    !adminPage.includes("openMemory") &&
    !adminPage.includes("memoryModal")
);

const cabinetPage = read("src/app/cabinet/page.tsx");
assert(
  "cabinet UI uses memory facts",
  cabinetPage.includes("CabinetMemoryFacts")
);
assert(
  "cabinet memory is a bottom nav tab",
  cabinetPage.includes('case "memory"') && cabinetPage.includes("hideTitle")
);

const factsRoute = read("src/app/api/memory/facts/route.ts");
assert(
  "user can POST memory facts",
  factsRoute.includes("export async function POST") &&
    factsRoute.includes("validateUserSubmittedFact")
);
assert(
  "memory facts POST requires PD consent",
  factsRoute.includes("pdConsent") && factsRoute.includes("consent_required")
);
assert(
  "manual fact add enables memory read (not auto-capture)",
  factsRoute.includes("memoryEnabled: true") && factsRoute.includes("updateMemoryPreferences")
);
assert(
  "memory facts API supports PATCH edit",
  factsRoute.includes("export async function PATCH") && factsRoute.includes("updateFact")
);

const cabinetMemory = read("src/components/cabinet/CabinetMemoryFacts.tsx");
assert(
  "cabinet memory uses premium fact cards",
  cabinetMemory.includes("formatMemoryFactForDisplay") &&
    cabinetMemory.includes("FACT_CATEGORY_ACCENTS")
);
assert(
  "cabinet memory shows PD consent before save",
  cabinetMemory.includes("pdConsent") &&
    cabinetMemory.includes("152-ФЗ") &&
    cabinetMemory.includes("/privacy")
);
assert(
  "cabinet memory exposes governance toggles",
  cabinetMemory.includes("/api/memory/preferences") &&
    cabinetMemory.includes("autoCaptureEnabled") &&
    cabinetMemory.includes("Использовать память в сеансах")
);
assert(
  "cabinet memory supports edit + purge",
  cabinetMemory.includes("method: \"PATCH\"") &&
    cabinetMemory.includes("/api/memory/purge") &&
    cabinetMemory.includes("Очистить всю память")
);

const userFactDisplay = read("src/lib/memory/user-fact-display.ts");
assert(
  "user fact display module normalizes and formats facts",
  userFactDisplay.includes("normalizeUserFactPhrase") &&
    userFactDisplay.includes("formatMemoryFactForDisplay")
);
assert(
  "cabinet memory add form opens in modal",
  cabinetMemory.includes("addModalOpen") && cabinetMemory.includes("Добавить факт")
);
assert(
  "cabinet UI can add memory facts",
  cabinetMemory.includes('method: "POST"') && cabinetMemory.includes("handleAdd")
);

const userFactInput = read("src/lib/memory/user-fact-input.ts");
assert(
  "user fact input is client-safe",
  userFactInput.includes("validateUserSubmittedFact") &&
    !userFactInput.includes("@/lib/llm")
);

assert(
  "chat-orchestrator uses the shared memory-context helper",
  orchestrator.includes("buildMemoryContext")
);
assert(
  "chat-orchestrator paid full spreads use reading-mode builders",
  orchestrator.includes("shouldUsePremiumReadingPrompt") &&
    orchestrator.includes("buildCharacterPrompt") &&
    orchestrator.includes("buildHumanReadingPrompt") &&
    orchestrator.includes("buildPaidSpreadReadingExtras")
);

assert(
  "dead code getUserMemoryPreview was removed",
  !userMemory.includes("getUserMemoryPreview")
);

const sessionMemorySemantic = read("src/lib/memory/session-memory-semantic.ts");
assert(
  "session-memory relevance has a semantic (embeddings) fallback, not lexical-only",
  sessionMemorySemantic.includes("isTextRelevantToQueryAsync") &&
    sessionMemorySemantic.includes("embedTexts")
);
assert(
  "memory-relevance.ts stays client-bundle-safe (no Node-only embeddings import)",
  !/^import .*from ["']@\/lib\/memory\/embeddings["']/m.test(relevance) &&
    !/^import .*from ["']@\/lib\/db["']/m.test(relevance)
);

const dbSrc = read("src/lib/db.ts");
assert(
  "db pool applies session GUCs on every new connection, not a one-shot query",
  dbSrc.includes('pool.on("connect"') && dbSrc.includes("hnsw.iterative_scan")
);

assert(
  "user_facts has a decay path for stale undated critical facts",
  userFacts.includes("decayStaleCriticalFacts") && userFacts.includes("CRITICAL_DECAY_AFTER_DAYS")
);
assert(
  "MAX_FACTS_PER_USER is exported for reuse by the facts API cap check",
  userFacts.includes("export const MAX_FACTS_PER_USER")
);

assert(
  "manual-fact cap counts only user-submitted facts, not auto-extracted ones",
  factsRoute.includes('sourceCharacter === "user"') &&
    !factsRoute.includes("existing.length >= MAX_MANUAL_FACTS_PER_USER")
);
assert(
  "memory facts API exposes fact source to the client",
  factsRoute.includes("addedByUser")
);

const purgeRoute = read("src/app/api/memory/purge/route.ts");
assert(
  "self-service full memory purge exists, is authenticated, and requires confirmation",
  purgeRoute.includes("export async function POST") &&
    purgeRoute.includes("requireUserAuth") &&
    purgeRoute.includes("purgeAllUserMemory") &&
    purgeRoute.includes("confirm")
);

const adminMemoryStatsRoute = read("src/app/api/admin/memory/stats/route.ts");
assert(
  "admin memory stats route requires admin auth",
  adminMemoryStatsRoute.includes("requireAdmin")
);

const deployYml = read(".github/workflows/deploy.yml");
assert(
  "deploy.yml is manual preview-only",
  deployYml.includes("workflow_dispatch") && !deployYml.includes("- master")
);

const gitignore = read(".gitignore");
assert(
  "gitignore excludes local debug artifacts",
  gitignore.includes(".tmp-*")
);

const migration079 = read("scripts/migrations/079_migrate_memory_governance.sql");
assert(
  "migration 079 creates prefs, jobs, tombstones",
  migration079.includes("user_memory_preferences") &&
    migration079.includes("memory_extraction_jobs") &&
    migration079.includes("user_memory_tombstones")
);
const migration080 = read("scripts/migrations/080_fix_memory_extraction_outbox.sql");
assert(
  "migration 080 drops session-level outbox unique index",
  migration080.includes("DROP INDEX IF EXISTS idx_memory_extraction_jobs_dedupe") &&
    migration080.includes("idx_memory_extraction_jobs_pending_msg")
);
const extractionJobs = read("src/lib/memory/extraction-jobs.ts");
assert(
  "enqueue inserts a new job per turn (no completed-job freeze)",
  extractionJobs.includes("INSERT INTO memory_extraction_jobs") &&
    !extractionJobs.includes("WHEN memory_extraction_jobs.status = 'completed'")
);
assert(
  "employment predicates mutually supersede",
  read("src/lib/memory/predicates.ts").includes("supersedeGroupForPredicate") &&
    read("src/lib/memory/user-facts.ts").includes("supersedeGroupForPredicate")
);

const installCrons = read("proxmox-setup/install-crons.sh");
assert(
  "install-crons schedules memory-extract every 5 minutes",
  installCrons.includes("cron-memory-extract.sh") && installCrons.includes("*/5 * * * *")
);
assert(
  "install-crons hardens cron wrappers to mode 750 (not world-writable)",
  installCrons.includes("chmod 750")
);
const vmDeploy = read("proxmox-setup/vm_local_deploy.sh");
assert(
  "vm_local_deploy hardens file modes after rsync",
  vmDeploy.includes("Hardening /opt/aura-ai file modes") &&
    vmDeploy.includes("chmod 755") &&
    vmDeploy.includes("chmod 644")
);

const numerologyRunner = read("src/lib/services/numerology-tool-runner.ts");
assert(
  "numerology tool runner uses buildMemoryContext + recordTurn",
  numerologyRunner.includes("buildMemoryContext") && numerologyRunner.includes("recordTurn")
);

const privacy = read("src/app/(legal)/privacy/page.tsx");
assert(
  "privacy policy documents memory opt-in and cabinet controls",
  privacy.includes("По умолчанию память") &&
    privacy.includes("управлять памятью ИИ")
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
