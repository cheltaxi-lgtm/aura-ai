import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: m.query, queryClient: m.query }));
import { findSpreadReadingEntry } from "@/lib/reading-idempotency";
import { findCachedIntentionSpread } from "@/lib/accounts";
import { findStoredSpreadReadingWithMeta } from "@/lib/session-spread-reading";

describe("cache consumers require the actual reading resource", () => {
  beforeEach(() => vi.clearAllMocks());
  it("plain reading ignores a legacy same-card result and a different semantic request", async () => {
    m.query.mockResolvedValue({ rows: [{ id: "legacy", context_data: { reading: "Старый ответ", tarotCards: [{ name: "Маг" }] } },
      { id: "other", context_data: { reading: "Другой ответ", readingResourceKey: "spread-resource:other" } }] });
    expect(await findSpreadReadingEntry("user", "veronika", "spread-resource:current")).toBeNull();
    expect(m.query.mock.calls[0][0]).toContain("readingResourceKey");
    expect(m.query.mock.calls[0][1]).toEqual(["user", "veronika", "spread-resource:current"]);
  });
  it("plain reading recovers its exact persisted result beyond unrelated history", async () => {
    const saved = { id: "owned", context_data: { reading: "Точный ответ", readingResourceKey: "spread-resource:current" } };
    m.query.mockResolvedValue({ rows: [saved] });
    expect(await findSpreadReadingEntry("user", "veronika", "spread-resource:current")).toBe(saved);
  });
  it("intention cache rejects another question/profile despite equal cards and session", () => {
    const context = { type: "intention_spread", intention: "custom", spreadId: "triplet", sessionId: "session", tarotCards: [{ name: "Маг" }], reading: "Подробная сохранённая трактовка. ".repeat(8), intentionResourceKey: "resource-a" };
    const rows = [{ id: "history", character_name: "veronika", context_data: context, is_paid: true, created_at: new Date() }];
    expect(findCachedIntentionSpread(rows, "veronika", "custom", [{ name: "Маг" }], "triplet", { sessionId: "session", resourceIdentity: "resource-b" })).toBeNull();
    expect(findCachedIntentionSpread(rows, "veronika", "custom", [{ name: "Маг" }], "triplet", { sessionId: "session", resourceIdentity: "resource-a" })?.reading).toBe(context.reading);
  });
  it("session chat repair cannot attach another consultation with the same cards", async () => {
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("context_data->>'sessionId'") || sql.includes("session_memories") ? [] : [{ context_data: { sessionId: "other-session", type: "intention_spread", intention: "love", tarotCards: [{ name: "Солнце" }, { name: "Маг" }, { name: "Звезда" }], reading: "Подробная другая трактовка. ".repeat(8) } }] }));
    const session = { id: "new-session", intention: "love", spread_id: "triplet", spread_type: "new", cards: ["Солнце", "Маг", "Звезда"] } as Parameters<typeof findStoredSpreadReadingWithMeta>[2];
    expect(await findStoredSpreadReadingWithMeta("user", "veronika", session)).toBeNull();
  });
});
