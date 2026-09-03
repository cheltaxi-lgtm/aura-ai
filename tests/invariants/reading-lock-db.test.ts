import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool, query } from "@/lib/db";
import { withReadingLock } from "@/lib/reading-lock";
import { hasTestDb } from "./db/setup-env";

describe.skipIf(!hasTestDb)("reading lock PostgreSQL concurrency", () => {
  afterAll(async () => { await getPool().end(); });
  it("serializes four concurrent generations while their callbacks can query the DB", async () => {
    const key = `launch-lock:${randomUUID()}`;
    let active = 0;
    let peak = 0;
    let completed = 0;
    await Promise.all(Array.from({ length: 4 }, () => withReadingLock(key, async () => {
      peak = Math.max(peak, ++active);
      try {
        await query("SELECT pg_sleep(0.02)");
        completed++;
      } finally { active--; }
    })));
    expect(peak).toBe(1);
    expect(completed).toBe(4);
  });
  it("releases a failed generation so the same key remains retryable", async () => {
    const key = `launch-lock:${randomUUID()}`;
    await expect(withReadingLock(key, async () => { throw new Error("generation failed"); })).rejects.toThrow("generation failed");
    await expect(withReadingLock(key, async () => "recovered")).resolves.toBe("recovered");
  });
});
