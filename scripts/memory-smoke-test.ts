/**
 * Deploy-gating smoke test for long-term memory — runs the REAL production code
 * (imports searchFacts / loadClientMemoryBlock / events / critical), not SQL
 * replicas. Seeds a disposable temp user, asserts consent-gated read path,
 * and always cleans up.
 *
 * Run:  cd /opt/aura-ai && <env> npx tsx scripts/memory-smoke-test.ts
 */
import { query } from "@/lib/db";
import {
  upsertFact,
  upsertFacts,
  searchFacts,
  getUpcomingEvents,
  getCriticalFacts,
  purgeFacts,
  purgeAllUserMemory,
  updateFact,
  deleteFact,
} from "@/lib/memory/user-facts";
import { loadClientMemoryBlock, recordTurn } from "@/lib/memory/client-memory";
import { updateMemoryPreferences, revokeMemoryConsent } from "@/lib/memory/preferences";
import { isFactTombstoned } from "@/lib/memory/tombstones";

const U = "00000000-0000-0000-0000-0000000000aa";

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fails++;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function okRetry(
  produce: () => Promise<boolean>,
  message: string,
  attempts = 3,
  backoffMs = 1500
) {
  let passed = false;
  for (let i = 1; i <= attempts; i++) {
    try {
      passed = await produce();
    } catch (e) {
      passed = false;
      if (i === attempts) {
        console.error(`    (attempt ${i} threw: ${e instanceof Error ? e.message : e})`);
      }
    }
    if (passed) break;
    if (i < attempts) await sleep(backoffMs * i);
  }
  ok(passed, message);
}

async function cleanup() {
  await purgeAllUserMemory(U).catch(() => {});
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

  const eventDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

  try {
    await upsertFacts(U, [
      { fact: `У клиента сын Артём, выпускной ${eventDate}`, category: "event", eventDate, salience: 3 },
      { fact: "Клиент работает программистом и думает сменить работу", category: "work", salience: 3 },
      { fact: "Клиент разводится с женой", category: "relationship", salience: 5 },
      { fact: "У клиента ипотека, переживает из-за долгов", category: "money", salience: 4 },
    ]);

    // Fail-closed without consent: facts exist but must not inject.
    const denied = await loadClientMemoryBlock({
      userId: U,
      queryText: "Артём выпускной и смена работы",
    });
    ok(!denied.trim(), "without consent, memory block is empty");

    await updateMemoryPreferences(U, {
      memoryEnabled: true,
      autoCaptureEnabled: false,
    });

    await okRetry(async () => {
      const work = await searchFacts(U, "стоит ли мне менять работу?", { topK: 3 });
      return work.some((f) => /работ/i.test(f.fact));
    }, "hybrid retrieval surfaces work fact");

    await okRetry(async () => {
      const kw = await searchFacts(U, "Артём", { topK: 3 });
      return kw.some((f) => /Артём/i.test(f.fact));
    }, "keyword query surfaces the keyword fact");

    const ev = await getUpcomingEvents(U);
    ok(ev.some((f) => /выпускн|Артём/i.test(f.fact)), "upcoming dated event surfaced");

    const crit = await getCriticalFacts(U);
    ok(crit.some((f) => /развод/i.test(f.fact)), "critical (salience>=5) fact surfaced");

    const block = await loadClientMemoryBlock({
      userId: U,
      queryText: "Артём выпускной и смена работы",
    });
    ok(/ДОЛГОСРОЧНАЯ ПАМЯТЬ/.test(block), "assembled block has memory header");
    ok(/upcoming_events|<fact /.test(block), "assembled block serializes facts");
    ok(/trusted="false"/.test(block), "assembled block marks memory untrusted");

    // Empty query must not inject events/critical/facts.
    const emptyBlock = await loadClientMemoryBlock({ userId: U, queryText: "" });
    ok(!emptyBlock.trim(), "empty query injects nothing");

    // Auto-capture off ⇒ recordTurn must not enqueue.
    await recordTurn({
      userId: U,
      userMessage: "У меня новая работа в банке",
      assistantReply: "Понял.",
      sourceType: "smoke",
    });
    const { rows: jobsOff } = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM memory_extraction_jobs WHERE user_id=$1`,
      [U]
    );
    ok(Number(jobsOff[0]?.c ?? 0) === 0, "auto-capture off does not enqueue extraction");

    await updateMemoryPreferences(U, { autoCaptureEnabled: true });
    const sessionId = "00000000-0000-0000-0000-0000000000bb";
    await recordTurn({
      userId: U,
      userMessage: "У меня новая работа в банке",
      assistantReply: "Понял.",
      sourceType: "chat",
      sourceEntityId: sessionId,
    });
    await recordTurn({
      userId: U,
      userMessage: "Ещё у меня сын Артём учится в пятом классе",
      assistantReply: "Хорошо.",
      sourceType: "chat",
      sourceEntityId: sessionId,
    });
    const { rows: jobsOn } = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM memory_extraction_jobs WHERE user_id=$1 AND status='pending'`,
      [U]
    );
    ok(Number(jobsOn[0]?.c ?? 0) >= 2, "each chat turn enqueues its own extraction job");

    // Employment lifecycle: searching → current must supersede the old row.
    const searchingFact = "Клиент ищет работу программистом";
    const currentFact = "Клиент устроился программистом в банк";
    ok(
      await upsertFact(U, {
        fact: searchingFact,
        category: "work",
        salience: 4,
        predicateKey: "employment.searching",
        operation: "replace",
        sourceType: "chat",
      }),
      "seeded employment.searching fact"
    );
    ok(
      await upsertFact(U, {
        fact: currentFact,
        category: "work",
        salience: 4,
        predicateKey: "employment.current",
        operation: "replace",
        sourceType: "chat",
      }),
      "seeded employment.current fact"
    );
    const { rows: empStatus } = await query<{
      id: string;
      status: string;
      predicate_key: string;
      fact: string;
    }>(
      `SELECT id, status, predicate_key, fact FROM user_facts
        WHERE user_id=$1 AND predicate_key IN ('employment.searching','employment.current')`,
      [U]
    );
    const searchingRow = empStatus.find((r) => r.predicate_key === "employment.searching");
    const currentRow = empStatus.find((r) => r.predicate_key === "employment.current");
    ok(currentRow?.status === "active", "employment.current stays active after replace");
    ok(
      Boolean(searchingRow) && searchingRow?.status === "superseded",
      "employment.searching is superseded by employment.current (not merged away)"
    );
    ok(
      empStatus.filter((r) => r.status === "active" && r.predicate_key?.startsWith("employment.")).length === 1,
      "only one active employment.* fact remains"
    );

    // Tombstone blocks re-ingest of deleted text.
    if (currentRow?.id) {
      await deleteFact(U, currentRow.id);
      ok(await isFactTombstoned(U, currentFact), "deleteFact adds tombstone");
      const blocked = await upsertFact(U, {
        fact: currentFact,
        category: "work",
        salience: 4,
        predicateKey: "employment.current",
        operation: "replace",
        sourceType: "chat",
      });
      ok(!blocked, "tombstoned fact cannot be re-ingested");
    }

    // updateFact never wipes an existing embedding to null (COALESCE path).
    const residenceFact = "Клиент живёт в Екатеринбурге";
    ok(
      await upsertFact(U, {
        fact: residenceFact,
        category: "personal",
        salience: 3,
        predicateKey: "residence.current",
        operation: "replace",
        sourceType: "user",
        sourceCharacter: "user",
      }),
      "seeded residence fact for edit"
    );
    const { rows: residenceRows } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id=$1 AND predicate_key='residence.current' AND status='active'
        LIMIT 1`,
      [U]
    );
    const residenceId = residenceRows[0]?.id;
    if (residenceId) {
      await query(
        `UPDATE user_facts
            SET embedding = array_fill(0.01::real, ARRAY[1024])::vector,
                embedding_model = 'smoke-embed'
          WHERE id=$1`,
        [residenceId]
      );
      const updated = await updateFact(U, residenceId, {
        fact: "Клиент живёт в Екатеринбурге, район Центр",
        category: "personal",
        predicateKey: "residence.current",
        sourceCharacter: "user",
        sourceType: "user",
      });
      ok(Boolean(updated), "updateFact returns updated row");
      const after = await query<{ fact: string; has_emb: boolean }>(
        `SELECT fact, (embedding IS NOT NULL) AS has_emb FROM user_facts WHERE id=$1`,
        [residenceId]
      );
      ok(
        Boolean(after.rows[0]?.fact?.includes("Центр")),
        "updateFact persists edited fact text"
      );
      ok(after.rows[0]?.has_emb === true, "updateFact never wipes existing embedding to null");
    }

    await revokeMemoryConsent(U);
    const afterRevoke = await loadClientMemoryBlock({
      userId: U,
      queryText: "работа Артём",
    });
    ok(!afterRevoke.trim(), "revoked consent stops memory injection");
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
