import { createAsyncJob } from "@/lib/async-jobs";
import { describe, expect, it } from "vitest";
import { query, withTransaction } from "@/lib/db";
import { recordInitialMemoryChoice, updateMemoryPreferences } from "@/lib/memory/preferences";
import { claimMemoryExtractionJobs, completeMemoryExtractionJob, enqueueMemoryExtraction, saveMemoryExtractionResult } from "@/lib/memory/extraction-jobs";
import { purgeAllUserMemory, upsertFact } from "@/lib/memory/user-facts";
import { captureMemoryGeneration, readMemoryWriteConsent } from "@/lib/memory/write-guard";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("durable memory ownership and erasure (db)", () => {
  installDbLifecycle();
  async function owner() {
    const user = await createTestUser({ name: "Memory guards" });
    await recordInitialMemoryChoice(user.id, "enabled");
    return user.id;
  }
  it("recovers a crashed worker and fences the old claim", async () => {
    const userId = await owner();
    await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я ищу новую работу" });
    const [first] = await claimMemoryExtractionJobs(1, userId);
    await query(`UPDATE memory_extraction_jobs SET claimed_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`, [first.id]);
    const [second] = await claimMemoryExtractionJobs(1, userId);
    expect(second.id).toBe(first.id);
    expect(second.claimToken).not.toBe(first.claimToken);
    await completeMemoryExtractionJob(first.id, first.claimToken);
    expect((await query(`SELECT status FROM memory_extraction_jobs WHERE id=$1`, [first.id])).rows[0].status).toBe("running");
    expect(await upsertFact(userId, { fact: "Клиент ищет работу", sourceType: "chat", captureGeneration: first.captureGeneration,
      extractionClaim: { jobId: first.id, claimToken: first.claimToken } })).toBe(false);
    await completeMemoryExtractionJob(second.id, second.claimToken);
    expect((await query(`SELECT status FROM memory_extraction_jobs WHERE id=$1`, [first.id])).rows[0].status).toBe("completed");
  });
  it("purge prevents an in-flight job from recreating a new fact even after re-enable", async () => {
    const userId = await owner();
    await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я живу в Казани" });
    const [job] = await claimMemoryExtractionJobs(1, userId);
    await purgeAllUserMemory(userId);
    await recordInitialMemoryChoice(userId, "enabled");
    expect(await upsertFact(userId, { fact: "Клиент живёт в Казани", sourceType: "chat", captureGeneration: job.captureGeneration,
      extractionClaim: { jobId: job.id, claimToken: job.claimToken } })).toBe(false);
    expect((await query(`SELECT id FROM user_facts WHERE user_id=$1`, [userId])).rows).toHaveLength(0);
  });
  it("does not complete an expired claim without a takeover", async () => {
    const userId = await owner();
    await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я ищу новую работу" });
    const [job] = await claimMemoryExtractionJobs(1, userId);
    await query(`UPDATE memory_extraction_jobs SET claimed_at=NOW()-INTERVAL '11 minutes' WHERE id=$1`, [job.id]);
    await completeMemoryExtractionJob(job.id, job.claimToken);
    expect((await query(`SELECT status FROM memory_extraction_jobs WHERE id=$1`, [job.id])).rows[0].status).toBe("running");
    expect((await claimMemoryExtractionJobs(1, userId))[0].claimToken).not.toBe(job.claimToken);
  });
  it("replaying the first committed fact after a partial failure does not confirm it twice", async () => {
    const userId = await owner();
    const fact = "Клиент работает инженером";
    await upsertFact(userId, { fact, sourceType: "user" });
    await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: fact });
    const [job] = await claimMemoryExtractionJobs(1, userId);
    const input = { fact, sourceType: "chat", captureGeneration: job.captureGeneration,
      extractionClaim: { jobId: job.id, claimToken: job.claimToken } };
    expect(await upsertFact(userId, input)).toBe(true);
    const before = (await query(`SELECT confirmation_count FROM user_facts WHERE user_id=$1`, [userId])).rows[0].confirmation_count;
    expect(await upsertFact(userId, input)).toBe(false);
    expect((await query(`SELECT confirmation_count FROM user_facts WHERE user_id=$1`, [userId])).rows[0].confirmation_count).toBe(before);
  });
  it("consent generation rejects stale direct captures and preserves unrelated settings", async () => {
    const userId = await owner();
    const consent = await readMemoryWriteConsent(userId);
    await updateMemoryPreferences(userId, { memoryEnabled: false });
    await updateMemoryPreferences(userId, { momentsMode: "quiet" });
    expect((await readMemoryWriteConsent(userId))?.memoryEnabled).toBe(false);
    await recordInitialMemoryChoice(userId, "enabled");
    expect(await upsertFact(userId, { fact: "Клиент работает инженером", sourceType: "chat", captureGeneration: consent!.generation })).toBe(false);
  });
  it("rejects late enqueue with the originating generation after purge and re-enable", async () => {
    const userId = await owner();
    const captureGeneration = await captureMemoryGeneration(userId);
    await purgeAllUserMemory(userId);
    await recordInitialMemoryChoice(userId, "enabled");
    expect(await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я живу в Казани", captureGeneration })).toBeNull();
    expect(await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я живу в Казани", captureGeneration: null })).toBeNull();
  });
  it("manual add with the pre-purge generation cannot recreate memory", async () => {
    const userId = await owner();
    const before = await readMemoryWriteConsent(userId);
    await purgeAllUserMemory(userId);
    expect(await upsertFact(userId, { fact: "Я работаю инженером", sourceType: "user", captureGeneration: before!.generation })).toBe(false);
  });
  it("old source metadata is not captured after a later consent change", async () => {
    const userId = await owner();
    expect(await captureMemoryGeneration(userId, "2000-01-01T00:00:00Z")).toBeNull();
    expect(await captureMemoryGeneration(userId)).not.toBeNull();
  });
  it("UI preference edits preserve the source consent timestamp", async () => {
    const userId = await owner();
    const source = (await query("SELECT NOW() AS created_at")).rows[0].created_at;
    const generation = await captureMemoryGeneration(userId, source);
    expect(generation).not.toBeNull();
    await updateMemoryPreferences(userId, { cabinetMode: "advanced", momentsMode: "quiet" });
    expect(await captureMemoryGeneration(userId, source)).toBe(generation);
  });
  it("durable product jobs retain the consent accepted at enqueue", async () => {
    const userId = await owner();
    const generation = await captureMemoryGeneration(userId);
    const id = await createAsyncJob({ userId, kind: "reading", payload: { customQuestion: "Моя работа" } });
    await purgeAllUserMemory(userId);
    await recordInitialMemoryChoice(userId, "enabled");
    const row = (await query("SELECT provenance FROM async_jobs WHERE id=$1", [id])).rows[0];
    expect(row.provenance.memoryCaptureGeneration).toBe(generation);
    expect(row.provenance.memoryCaptureGeneration).not.toBe(await captureMemoryGeneration(userId));
  });
  it("a recovered job reuses the durable extracted batch", async () => {
    const userId = await owner();
    await enqueueMemoryExtraction({ userId, sourceType: "chat", userMessage: "Я работаю инженером" });
    const [job] = await claimMemoryExtractionJobs(1, userId);
    const result = { facts: [{ fact: "Клиент работает инженером" }], parsedCount: 1, groundingRejectedCount: 0 };
    expect(await saveMemoryExtractionResult(job.id, job.claimToken, result)).toBe(true);
    await query("UPDATE memory_extraction_jobs SET claimed_at=NOW()-INTERVAL '11 minutes' WHERE id=$1", [job.id]);
    const [recovered] = await claimMemoryExtractionJobs(1, userId);
    expect(recovered.extractionResult).toEqual(result);
    expect(await saveMemoryExtractionResult(job.id, job.claimToken, { ...result, facts: [] })).toBe(false);
  });
  it("rolls back the entire purge on failure and never affects another owner", async () => {
    const userId = await owner();
    const otherId = await owner();
    await upsertFact(userId, { fact: "Клиент работает инженером", sourceType: "user" });
    await upsertFact(otherId, { fact: "Клиент работает инженером", sourceType: "user" });
    await expect(withTransaction(async (client) => {
      await purgeAllUserMemory(userId, client);
      throw new Error("simulated rollback");
    })).rejects.toThrow("simulated rollback");
    expect((await readMemoryWriteConsent(userId))?.memoryEnabled).toBe(true);
    expect((await query(`SELECT id FROM user_facts WHERE user_id=$1`, [userId])).rows).toHaveLength(1);
    await purgeAllUserMemory(userId);
    expect((await query(`SELECT id FROM user_facts WHERE user_id=$1`, [otherId])).rows).toHaveLength(1);
  });
});
