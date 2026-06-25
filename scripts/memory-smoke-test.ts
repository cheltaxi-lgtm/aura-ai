/**
 * Deploy-gating smoke test for long-term memory — runs the REAL production code
 * (imports searchFacts / loadClientMemoryBlock / events / critical), not SQL
 * replicas. This is deliberate: hand-written SQL copies drift from the real
 * queries and have twice hidden retrieval bugs (param typing, ambiguous "id")
 * that `tsc`/`next build` cannot see. Seeds a disposable temp user, asserts the
 * full read path, and always cleans up.
 *
 * Deterministic: seeding uses embeddings (reliable) but no extraction LLM, so it
 * does not flake. Tolerant of the embeddings provider being down (vector signal
 * simply drops out; lexical + events + critical still validate the SQL + facade).
 *
 * Run:  cd /opt/aura-ai && <env> npx tsx scripts/memory-smoke-test.ts
 */
import { query } from "@/lib/db";
import {
  upsertFacts,
  searchFacts,
  getUpcomingEvents,
  getCriticalFacts,
  purgeFacts,
} from "@/lib/memory/user-facts";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";

const U = "00000000-0000-0000-0000-0000000000aa";

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fails++;
};

async function cleanup() {
  await purgeFacts(U).catch(() => {});
  await query(`DELETE FROM users WHERE id=$1`, [U]).catch(() => {});
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("memory-smoke-test: DATABASE_URL not set — skipping.");
    return;
  }
  await cleanup();
  await query(
    `INSERT INTO users (id,name,gender,birth_date,zodiac) VALUES ($1,'__smoke_temp','male','1990-01-01','Козерог')`,
    [U]
  );

  try {
    // Seed via the REAL write path (embeds; no chat LLM → not flaky).
    await upsertFacts(U, [
      { fact: "У клиента сын Артём, выпускной 2026-07-10", category: "event", eventDate: "2026-07-10", salience: 3 },
      { fact: "Клиент работает программистом и думает сменить работу", category: "work", salience: 3 },
      { fact: "Клиент разводится с женой", category: "relationship", salience: 5 },
      { fact: "У клиента ипотека, переживает из-за долгов", category: "money", salience: 4 },
    ]);

    // Hybrid retrieval (this is where the param-typing & ambiguous-id bugs lived).
    const work = await searchFacts(U, "стоит ли мне менять работу?", { topK: 3 });
    ok(work.some((f) => /работ/i.test(f.fact)), "hybrid retrieval surfaces work fact");

    const kw = await searchFacts(U, "Артём", { topK: 3 });
    ok(kw.some((f) => /Артём/i.test(f.fact)), "keyword query surfaces the keyword fact");

    const ev = await getUpcomingEvents(U);
    ok(ev.some((f) => /выпускн|Артём/i.test(f.fact)), "upcoming dated event surfaced");

    const crit = await getCriticalFacts(U);
    ok(crit.some((f) => /развод/i.test(f.fact)), "critical (salience>=5) fact surfaced");

    const block = await loadClientMemoryBlock({ userId: U, queryText: "что будет с работой и семьёй?" });
    ok(/ДОЛГОСРОЧНАЯ ПАМЯТЬ/.test(block), "assembled block has memory header");
    ok(/БЛИЖАЙШИЕ СОБЫТИЯ/.test(block), "assembled block has upcoming-events section");
  } finally {
    await cleanup();
  }

  if (fails > 0) {
    console.error(`\nmemory-smoke-test: ${fails} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nmemory-smoke-test: all checks passed");
  process.exit(0);
}

main().catch(async (e) => {
  console.error("memory-smoke-test: fatal:", e instanceof Error ? e.stack : e);
  await cleanup().catch(() => {});
  process.exit(1);
});
