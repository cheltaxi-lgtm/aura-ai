/**
 * Static checks for global memory relevance policy.
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

const photoRoute = read("src/app/api/photo-reading/stream/route.ts");
assert(
  "photo-reading uses the shared memory-context helper (not hand-rolled blocks)",
  photoRoute.includes("buildMemoryContext") && photoRoute.includes("appendMemoryContextToPrompt")
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
  /if \(!trimmed\) \{\s*return \[\];/s.test(userFacts)
);

const clientMemory = read("src/lib/memory/client-memory.ts");
assert(
  "loadClientMemoryBlock does NOT early-return on empty query (would make the " +
    "imminent-events-are-unconditional branch below it unreachable)",
  !clientMemory.includes('if (!queryTrimmed) return "";')
);
assert(
  "loadClientMemoryBlock still surfaces imminent events unconditionally of query relevance",
  clientMemory.includes("days <= IMMINENT_EVENT_DAYS) return true;")
);

const userMemory = read("src/lib/user-memory.ts");
assert(
  "buildMemoryBlock rejects empty query",
  userMemory.includes("if (!topicQuery) return \"\";")
);
assert(
  "buildClientBlock gates mainQuestion by relevance",
  userMemory.includes("isTextRelevantToQuery(query, profile.mainQuestion)")
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
assert(
  "cabinet UI exposes the self-service purge action",
  cabinetMemory.includes("/api/memory/purge") && cabinetMemory.includes("Очистить всю память")
);

const adminMemoryStatsRoute = read("src/app/api/admin/memory/stats/route.ts");
assert(
  "admin memory stats route requires admin auth",
  adminMemoryStatsRoute.includes("requireAdmin")
);

const deployYml = read(".github/workflows/deploy.yml");
assert(
  "deploy.yml triggers on master",
  deployYml.includes("- master")
);

const gitignore = read(".gitignore");
assert(
  "gitignore excludes local debug artifacts",
  gitignore.includes(".tmp-*")
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
