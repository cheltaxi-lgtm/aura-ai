import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ counter: 0, sessionId: "synthetic-session" }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/accounts", () => ({ getProfileUserIdForAccount: async () => "synthetic-profile", resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/users", () => ({ profileGenderForPersonalization: () => "female", getUserById: async () => ({ name: "Анна", gender: "female", birth_date: "1990-01-01", zodiac: "Овен" }) }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true, freeQuestions: 2 }) }));
vi.mock("@/lib/session", () => ({ getFreeQuestionLimit: async () => 2 }));
vi.mock("@/lib/session-access", () => ({ ensureChatSession: async () => ({ session: { id: m.sessionId, free_questions_used: m.counter }, created: false }) }));
vi.mock("@/lib/numerology/matrix-chat-allowance", () => ({ resolveMatrixAwareFreeQuestionLimit: async () => 2 }));
import { ChatOrchestrator } from "@/lib/services/chat-orchestrator";

async function prepare(content = "Первый вопрос", extra: Record<string, unknown> = {}) {
  const result = await ChatOrchestrator.prepare("synthetic-account", { characterId: "veronika", messages: [{ role: "user", content }], ...extra });
  if (!result.ok) throw new Error("fixture_prepare_failed");
  return result.billingParams;
}
describe("actual web chat preparation binds the accepted turn", () => {
  beforeEach(() => { m.counter = 0; m.sessionId = "synthetic-session"; });
  it("two different simultaneous questions with one counter have different purchases", async () => {
    const [a, b] = await Promise.all([prepare(), prepare("Второй вопрос")]);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey); expect(a.operationIdentity).not.toBe(b.operationIdentity);
  });
  it("a retry of the same accepted turn keeps its identity after the free slot counter changes", async () => {
    const first = await prepare(); m.counter = 1;
    expect((await prepare()).idempotencyKey).toBe(first.idempotencyKey);
  });
  it("another session or accepted image cannot use the first turn's purchase", async () => {
    const first = await prepare(); expect((await prepare("Первый вопрос", { imageBase64: "synthetic-image" })).idempotencyKey).not.toBe(first.idempotencyKey);
    m.sessionId = "another-session"; expect((await prepare()).operationIdentity).not.toBe(first.operationIdentity);
  });
  it("the same words in a new conversation history represent a new turn", async () => {
    const first = await prepare();
    const next = await prepare("Первый вопрос", { messages: [{ role: "user", content: "Первый вопрос" }, { role: "assistant", content: "Первый ответ" }, { role: "user", content: "Первый вопрос" }] });
    expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});
