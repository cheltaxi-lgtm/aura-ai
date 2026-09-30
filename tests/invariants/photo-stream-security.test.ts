import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prompt-policy", () => ({ wrapSystemPrompt: async (prompt: string) => prompt }));
vi.mock("@/lib/chat-sanitize", () => ({
  sanitizeChatHistory: (messages: unknown[]) => messages,
}));
vi.mock("@/lib/chat-reply-sanitize", () => ({
  chatReplyRejectionReason: () => null,
  isRejectedChatReply: () => false,
  stripMemoryLeakFromReply: (text: string) => text,
}));
vi.mock("@/lib/llm", () => ({
  buildUserMessageWithImage: (messages: unknown[]) => messages,
  isRejectedLlmOutput: () => false,
  streamChat: async () => new Response(
    'data: {"choices":[{"delta":{"content":"Оплаченный текст расклада."}}]}\n\ndata: [DONE]\n\n'
  ),
}));

import { createChatResponseStream } from "@/lib/chat-stream";

describe("photo paid stream delivery", () => {
  it("never exposes generated tokens when final validation or saving fails", async () => {
    const response = await createChatResponseStream({
      systemPrompt: "prompt",
      messages: [{ role: "user", content: "question" }],
      holdTokensUntilAccepted: true,
      onComplete: async () => ({ reply: "", llmFailed: true, refunded: true }),
    });
    const body = await response?.text();
    expect(body).not.toContain('"token"');
    expect(body).not.toContain("Оплаченный текст расклада");
    expect(body).toContain('"refunded":true');
  });

  it("releases text only after successful completion", async () => {
    const response = await createChatResponseStream({
      systemPrompt: "prompt",
      messages: [{ role: "user", content: "question" }],
      holdTokensUntilAccepted: true,
      onComplete: async ({ reply }) => ({ reply, llmFailed: false, saved: true }),
    });
    const body = await response?.text();
    expect(body).toContain('"token":"Оплаченный текст расклада."');
    expect(body).toContain('"saved":true');
  });
});
