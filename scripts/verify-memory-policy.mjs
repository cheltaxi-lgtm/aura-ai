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

const photoRoute = read("src/app/api/photo-reading/route.ts");
assert(
  "photo-reading uses composeMemoryQueryText",
  photoRoute.includes("composeMemoryQueryText") &&
    photoRoute.includes("queryText: memoryQuery")
);

const userFacts = read("src/lib/memory/user-facts.ts");
assert(
  "searchFacts empty query returns []",
  /if \(!trimmed\) \{\s*return \[\];/s.test(userFacts)
);

const clientMemory = read("src/lib/memory/client-memory.ts");
assert(
  "loadClientMemoryBlock rejects empty query",
  clientMemory.includes("if (!queryTrimmed) return \"\";")
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

const factsRoute = read("src/app/api/memory/facts/route.ts");
assert(
  "user can POST memory facts",
  factsRoute.includes("export async function POST") &&
    factsRoute.includes("validateUserSubmittedFact")
);

const userFactInput = read("src/lib/memory/user-fact-input.ts");
assert(
  "user fact input is client-safe",
  userFactInput.includes("validateUserSubmittedFact") &&
    !userFactInput.includes("@/lib/llm")
);

const cabinetMemory = read("src/components/cabinet/CabinetMemoryFacts.tsx");
assert(
  "cabinet UI can add memory facts",
  cabinetMemory.includes('method: "POST"') && cabinetMemory.includes("handleAdd")
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
