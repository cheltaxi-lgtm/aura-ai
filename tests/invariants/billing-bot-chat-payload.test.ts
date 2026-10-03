import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ billing: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: async () => ({ rows: [{ character_key: "veronika" }], rowCount: 1 }) }));
vi.mock("@/lib/telegram/bot-resolve", () => ({ resolveBotUser: async () => ({ linked: true, accountId: "account", profileUserId: "profile" }) }));
vi.mock("@/lib/services/billing-service", () => ({ chargeChatBilling: m.billing }));
vi.mock("@/lib/services/chat-orchestrator", () => ({
  parseChatRequest: async (parsed: unknown) => ({ ok: true, parsed }),
  ChatOrchestrator: { prepare: async (_account: string, parsed: { sessionId: string }) => ({ ok: true, orchestrator: {}, billingParams: { session: { id: parsed.sessionId, free_questions_used: 2 }, freeLimit: 2 } }) },
}));
import { botChatFollowUp } from "@/lib/telegram/bot-cabinet-service";

async function key(message: string, sessionId = "session-a") {
  const result = await botChatFollowUp({ telegramUserId: 42, sessionId, message, clientEventId: "same-event" });
  expect(result).toMatchObject({ ok: false, error: "fixture_charge_boundary" });
  return m.billing.mock.calls.at(-1)![0].idempotencyKey as string;
}

describe("actual bot chat caller binds event to session and canonical message", () => {
  beforeEach(() => { vi.clearAllMocks(); m.billing.mockImplementation(async () => ({ ok: false, response: NextResponse.json({ error: "fixture_charge_boundary" }, { status: 402 }) })); });
  it("reused event for different accepted text produces another purchase identity", async () => {
    expect(await key("Как наладить отношения?")).not.toBe(await key("Как изменить работу?"));
  });
  it("same event and message in another session cannot reuse the first purchase", async () => {
    expect(await key("Мой вопрос", "session-a")).not.toBe(await key("Мой вопрос", "session-b"));
  });
  it("trimmed retries of one accepted turn retain identity", async () => {
    expect(await key("  Мой вопрос  ")).toBe(await key("Мой вопрос"));
  });
});
