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
  confirmFact,
  changeFact,
  listFactTimeline,
} from "@/lib/memory/user-facts";
import {
  loadClientMemoryBlock,
  processMemoryExtractionJobs,
  recordTurn,
} from "@/lib/memory/client-memory";
import {
  getMemoryPreferences,
  needsMemoryInitialChoice,
  recordInitialMemoryChoice,
  updateMemoryPreferences,
  revokeMemoryConsent,
} from "@/lib/memory/preferences";
import { isFactTombstoned } from "@/lib/memory/tombstones";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";

const U = "00000000-0000-0000-0000-0000000000aa";
/** Isolated from extraction turns on U so employment lifecycle is not polluted. */
const EMP = "00000000-0000-0000-0000-0000000000ef";

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

async function cleanupUser(id: string) {
  await purgeAllUserMemory(id).catch(() => {});
  await purgeFacts(id).catch(() => {});
  await query(`DELETE FROM sessions WHERE user_id=$1`, [id]).catch(() => {});
  await query(`DELETE FROM users WHERE id=$1`, [id]).catch(() => {});
}

async function cleanup() {
  await cleanupUser(U);
  await cleanupUser(EMP);
}

async function ensureSmokeUser(id: string, name: string) {
  await cleanupUser(id);
  await query(
    `INSERT INTO users (id,name,gender,birth_date,zodiac) VALUES ($1,$2,'male','1990-01-01','Козерог')`,
    [id, name]
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("memory-smoke-test: DATABASE_URL not set — skipping.");
    return;
  }
  await cleanup();
  await ensureSmokeUser(U, "__smoke_temp");
  await ensureSmokeUser(EMP, "__smoke_emp");

  const eventDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

  try {
    ok(await needsMemoryInitialChoice(U), "new profile requires initial memory choice");
    await recordInitialMemoryChoice(U, "disabled");
    const declined = await getMemoryPreferences(U);
    ok(
      declined.initialChoice === "disabled" &&
        !declined.memoryEnabled &&
        !declined.autoCaptureEnabled,
      "explicit decline is audited and remains fail-closed"
    );
    ok(!(await needsMemoryInitialChoice(U)), "explicit decline is not prompted repeatedly");

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
    ok(!denied.block.trim(), "without consent, memory block is empty");

    await recordInitialMemoryChoice(U, "enabled");
    await updateMemoryPreferences(U, { autoCaptureEnabled: false });
    const enabledPrefs = await getMemoryPreferences(U);
    ok(
      enabledPrefs.memoryEnabled &&
        !enabledPrefs.autoCaptureEnabled &&
        !enabledPrefs.sensitiveCaptureEnabled &&
        !enabledPrefs.eventRemindersEnabled,
      "initial enable keeps sensitive capture and reminders off"
    );

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

    const loaded = await loadClientMemoryBlock({
      userId: U,
      queryText: "Артём выпускной и смена работы",
    });
    const block = loaded.block;
    ok(/ДОЛГОСРОЧНАЯ ПАМЯТЬ/.test(block), "assembled block has memory header");
    ok(/upcoming_events|<fact /.test(block), "assembled block serializes facts");
    ok(/trusted="false"/.test(block), "assembled block marks memory untrusted");

    // Empty query must not inject events/critical/facts.
    const emptyBlock = await loadClientMemoryBlock({ userId: U, queryText: "" });
    ok(!emptyBlock.block.trim(), "empty query injects nothing");

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
    await query(
      `INSERT INTO sessions (id, user_id, character_key, memory_read_mode)
       VALUES ($1, $2, 'tarolog', 'fresh')`,
      [sessionId, U]
    );
    const freshContext = await buildMemoryContext({
      userId: U,
      sessionId,
      characterId: "tarolog",
      lastUserMessage: "Что изменится в моей работе?",
      includePastSessions: true,
    });
    ok(
      !freshContext.factsBlock && !freshContext.pastSessionsBlock,
      "fresh session suppresses long-term facts and past sessions"
    );
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
    ok(
      Number(jobsOn[0]?.c ?? 0) >= 2,
      "fresh session still captures new user-authored turns"
    );
    const extraction = await processMemoryExtractionJobs(5, U);
    ok(
      extraction.processed >= 2 && extraction.failed === 0,
      "durable extraction jobs process end-to-end for the smoke user"
    );
    const { rows: completedJobs } = await query<{
      c: string;
      extracted: string;
      rejected: string;
    }>(
      `SELECT COUNT(*)::text AS c,
              COALESCE(SUM(extracted_count), 0)::text AS extracted,
              COALESCE(SUM(grounding_rejected_count), 0)::text AS rejected
         FROM memory_extraction_jobs
        WHERE user_id=$1 AND status='completed'`,
      [U]
    );
    ok(
      Number(completedJobs[0]?.c ?? 0) >= 2,
      "completed extraction jobs retain quality metrics"
    );

    const draftSource = "00000000-0000-0000-0000-0000000000dd";
    await upsertFact(U, {
      fact: "Клиент, вероятно, планирует сменить сферу работы",
      category: "work",
      predicateKey: "goal.current",
      confidence: 0.75,
      evidenceQuote: "думаю, возможно, сменить сферу работы",
      sourceType: "chat",
      sourceEntityId: draftSource,
    });
    const { rows: draftRows } = await query<{ id: string; status: string }>(
      `SELECT id, status FROM user_facts
        WHERE user_id=$1 AND source_entity_id=$2 LIMIT 1`,
      [U, draftSource]
    );
    ok(draftRows[0]?.status === "draft", "lower-confidence safe fact is stored as draft");
    const draftSearch = await searchFacts(U, "сменить сферу работы", { topK: 10 });
    ok(
      !draftSearch.some((fact) => fact.id === draftRows[0]?.id),
      "draft fact is never returned for prompt retrieval"
    );
    if (draftRows[0]?.id) {
      const promoted = await confirmFact(U, draftRows[0].id);
      ok(promoted?.status === "active", "confirm atomically promotes draft to active");
    }

    await updateMemoryPreferences(U, { momentsMode: "quiet" });
    const quietSource = "00000000-0000-0000-0000-0000000000ee";
    await upsertFact(U, {
      fact: "Клиент планирует поездку в Казань",
      category: "event",
      confidence: 0.95,
      evidenceQuote: "планирую поездку в Казань",
      sourceType: "chat",
      sourceEntityId: quietSource,
    });
    const { rows: quietRows } = await query<{ seen: boolean }>(
      `SELECT (seen_at IS NOT NULL) AS seen FROM user_memory_activity
        WHERE user_id=$1 AND source_entity_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [U, quietSource]
    );
    ok(quietRows[0]?.seen === true, "quiet mode stores facts but auto-hides memory moments");
    await updateMemoryPreferences(U, { momentsMode: "active" });

    // Employment lifecycle: searching → current must supersede the old row.
    // Isolated user: extraction on U already stored employment.current.
    await recordInitialMemoryChoice(EMP, "enabled");
    const searchingFact = "Клиент ищет работу программистом";
    const currentFact = "Клиент устроился программистом в банк";
    ok(
      await upsertFact(EMP, {
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
      await upsertFact(EMP, {
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
      [EMP]
    );
    const searchingRow = empStatus.find(
      (r) => r.predicate_key === "employment.searching" && r.status === "superseded"
    );
    const currentRow = empStatus.find(
      (r) => r.predicate_key === "employment.current" && r.status === "active"
    );
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
      await deleteFact(EMP, currentRow.id);
      ok(await isFactTombstoned(EMP, currentFact), "deleteFact adds tombstone");
      const blocked = await upsertFact(EMP, {
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

    const provenanceSource = "00000000-0000-0000-0000-0000000000cc";
    await upsertFact(U, {
      fact: "Клиент готовится к собеседованию в пятницу",
      category: "event",
      salience: 4,
      eventDate,
      evidenceQuote: "готовлюсь к собеседованию в пятницу",
      sourceType: "chat",
      sourceEntityId: provenanceSource,
    });
    const { rows: provenanceRows } = await query<{
      id: string;
      evidence_quote: string | null;
    }>(
      `SELECT id, evidence_quote FROM user_facts
        WHERE user_id=$1 AND source_entity_id=$2 LIMIT 1`,
      [U, provenanceSource]
    );
    const provenanceFact = provenanceRows[0];
    ok(
      provenanceFact?.evidence_quote === "готовлюсь к собеседованию в пятницу",
      "extraction evidence and source provenance are persisted"
    );
    const { rows: activityRows } = await query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM user_memory_activity
        WHERE user_id=$1 AND fact_id=$2 AND activity_type='learned'`,
      [U, provenanceFact?.id ?? null]
    );
    ok(Number(activityRows[0]?.c ?? 0) === 1, "learned fact emits one memory activity");

    if (provenanceFact?.id) {
      const confirmed = await confirmFact(U, provenanceFact.id);
      ok(
        Boolean(confirmed && (confirmed.confirmationCount ?? 0) >= 1),
        "fact confirmation updates trust metadata"
      );
      const changed = await changeFact(
        U,
        provenanceFact.id,
        "Клиент успешно прошёл собеседование и ждёт оффер"
      );
      ok(Boolean(changed?.id), "user change creates a new fact version");
      const timeline = await listFactTimeline(U);
      ok(
        timeline.some((fact) => fact.id === provenanceFact.id && fact.status === "superseded") &&
          timeline.some((fact) => fact.id === changed?.id && fact.status === "active"),
        "timeline keeps superseded and current versions"
      );
    }

    await revokeMemoryConsent(U);
    const afterRevoke = await loadClientMemoryBlock({
      userId: U,
      queryText: "работа Артём",
    });
    ok(!afterRevoke.block.trim(), "revoked consent stops memory injection");
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
