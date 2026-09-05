import { describe, expect, it } from "vitest";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import { listMemoryContextReceipts } from "@/lib/memory/context-receipts";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { changeFact, deleteFact, listFactTimeline, upsertFact } from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("real DB cross-product memory continuity", () => {
  installDbLifecycle();
  it("uses the same owned fact across products and invalidates receipts after correction/deletion", async () => {
    const owner = await createTestUser({ name: "Continuity owner" });
    const other = await createTestUser({ name: "Continuity other" });
    await recordInitialMemoryChoice(owner.id, "enabled");
    await recordInitialMemoryChoice(other.id, "enabled");
    await upsertFact(owner.id, { fact: "Клиент ищет работу дизайнером", predicateKey: "employment.searching", category: "work", sourceType: "user" });
    for (const product of ["chat", "reading", "photo", "matrix", "natal", "hd", "daily", "ritual", "aura", "palm"]) {
      const context = await buildMemoryContext({ userId: owner.id, characterId: product === "chat" ? "vesta" : "evelina", product,
        lastUserMessage: "Как мне найти работу дизайнером?", includePastSessions: false });
      expect(context.factsBlock, product).toContain("дизайнером");
      expect(context.retrievalMetrics.memory_selected_count).toBe(1);
    }
    expect((await listMemoryContextReceipts(owner.id)).length).toBeGreaterThan(0);
    expect(await listMemoryContextReceipts(other.id)).toEqual([]);
    const otherContext = await buildMemoryContext({ userId: other.id, characterId: "vesta", product: "chat", lastUserMessage: "Как мне найти работу дизайнером?" });
    expect(otherContext.factsBlock).toBe("");
    const [old] = await listFactTimeline(owner.id);
    const updated = await changeFact(owner.id, old.id, "Клиент работает дизайнером в студии");
    expect(updated).not.toBeNull();
    expect(await listMemoryContextReceipts(owner.id)).toEqual([]);
    const context = await buildMemoryContext({ userId: owner.id, characterId: "evelina", product: "natal", lastUserMessage: "Моя работа дизайнером в студии" });
    expect(context.factsBlock).toContain("в студии");
    await deleteFact(owner.id, updated!.id);
    expect((await listMemoryContextReceipts(owner.id)).flatMap(r => r.facts).some(f => f.id === updated!.id)).toBe(false);
  }, 90_000);
});
