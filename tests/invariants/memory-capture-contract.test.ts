import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), llm: vi.fn() }));
vi.mock("@/lib/memory/extraction-jobs", () => ({ enqueueMemoryExtraction: mocks.enqueue }));
vi.mock("@/lib/memory/preferences", () => ({ canAutoCapture: async () => true }));
vi.mock("@/lib/llm", () => ({ completeChat: mocks.llm }));
import { extractFactsFromTurnDetailed } from "@/lib/memory/extract-facts";
import { recordTurn } from "@/lib/memory/client-memory";

describe("short factual turns and originating consent", () => {
  beforeEach(() => { mocks.enqueue.mockReset(); mocks.llm.mockReset(); });
  it.each(["Я женат", "Я вдова", "Мне 30"])("queues a short fact: %s", async userMessage => {
    await recordTurn({ userId: "owner", userMessage, assistantReply: "", captureGeneration: "7" });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ userMessage, captureGeneration: "7" }));
  });
  it.each(["Я женат", "Я вдова", "Мне 30"])("short facts reach the extractor: %s", async userMessage => {
    mocks.llm.mockResolvedValue("[]");
    await extractFactsFromTurnDetailed(userMessage, "");
    expect(mocks.llm).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.stringContaining(userMessage) })]) }));
  });
  it("retries empty or malformed provider output instead of acknowledging lost extraction", async () => {
    mocks.llm.mockResolvedValueOnce("").mockResolvedValueOnce("temporary failure");
    await expect(extractFactsFromTurnDetailed("Я работаю инженером", "")).rejects.toThrow("memory_extraction_empty");
    await expect(extractFactsFromTurnDetailed("Я работаю инженером", "")).rejects.toThrow("memory_extraction_invalid_payload");
  });
  it("does not retroactively capture a turn begun without consent", async () => {
    await recordTurn({ userId: "owner", userMessage: "Я работаю инженером", assistantReply: "", captureGeneration: null });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not queue a factless acknowledgement", async () => {
    await recordTurn({ userId: "owner", userMessage: "Спасибо!", assistantReply: "", captureGeneration: "7" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
