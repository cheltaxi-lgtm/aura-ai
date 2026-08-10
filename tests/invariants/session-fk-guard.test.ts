import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: the nightly empty-session cleanup can delete a >48h stub session
// while a resumed old tab still has an in-flight chat. The next save then hit
// chat_messages/session_memories FK 23503 and the conversation died with a
// 502. saveMessage / upsertSessionMemoryFromChat must resurrect a minimal
// sessions stub and retry once instead of failing.

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock("@/lib/llm", () => ({
  completeChat: vi.fn(),
}));

import { saveMessage } from "@/lib/session";
import { upsertSessionMemoryFromChat } from "@/lib/session-memory";

const FK_ERROR = Object.assign(new Error("violates foreign key constraint"), {
  code: "23503",
});

beforeEach(() => {
  queryMock.mockReset();
});

describe("saveMessage FK guard", () => {
  it("resurrects the session stub and retries once on 23503", async () => {
    queryMock
      .mockRejectedValueOnce(FK_ERROR) // first insert fails
      .mockResolvedValue({ rows: [] }); // resurrect + retry

    await saveMessage("sess-1", "shri_raj", "user", "Привет", "user-1");

    expect(queryMock).toHaveBeenCalledTimes(3);
    const resurrectSql = String(queryMock.mock.calls[1][0]);
    expect(resurrectSql).toContain("INSERT INTO sessions");
    expect(resurrectSql).toContain("ON CONFLICT (id) DO NOTHING");
    expect(queryMock.mock.calls[1][1]).toEqual(["sess-1", "user-1", "shri_raj"]);
    // Final call is the retried chat_messages insert.
    expect(String(queryMock.mock.calls[2][0])).toContain(
      "INSERT INTO chat_messages"
    );
  });

  it("rethrows non-FK errors without resurrecting", async () => {
    const boom = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    queryMock.mockRejectedValueOnce(boom);

    await expect(
      saveMessage("sess-1", "shri_raj", "user", "Привет", null)
    ).rejects.toThrow("connection reset");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("upsertSessionMemoryFromChat FK guard", () => {
  it("resurrects the session stub and retries once on 23503", async () => {
    queryMock
      .mockRejectedValueOnce(FK_ERROR)
      .mockResolvedValue({ rows: [] });

    await upsertSessionMemoryFromChat({
      userId: "user-1",
      sessionId: "sess-9",
      characterKey: "shri_raj",
      topicSummary: "Тема",
      keyCards: ["Шут"],
      prediction: "Текст",
    });

    const sql = queryMock.mock.calls.map((c) => String(c[0]));
    const memoryUpserts = sql.filter((s) =>
      s.includes("INSERT INTO session_memories")
    );
    const resurrections = sql.filter((s) => s.includes("INSERT INTO sessions"));
    expect(memoryUpserts).toHaveLength(2); // initial + retry
    expect(resurrections).toHaveLength(1);
    expect(queryMock.mock.calls[sql.findIndex((s) => s.includes("INSERT INTO sessions"))][1]).toEqual([
      "sess-9",
      "user-1",
      "shri_raj",
    ]);
  });
});
