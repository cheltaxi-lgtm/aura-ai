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
  "admin memory lists session_memories",
  adminMemory.includes("listSessionMemoriesForUser")
);

assert(
  "user facts API exists",
  read("src/app/api/memory/facts/route.ts").includes("export async function GET")
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
