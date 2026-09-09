import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ streamChat: vi.fn() }));

vi.mock("@/lib/prompt-policy", () => ({
  wrapSystemPrompt: async (prompt: string) => prompt,
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/llm")>();
  return { ...original, streamChat: mocks.streamChat };
});

import { createChatResponseStream, type ChatStreamMeta } from "@/lib/chat-stream";

const cards = ["5 Кубков", "Звезда", "6 Мечей"];
const previous =
  "5 Кубков показывает сожаление о прошлом и задержку движения. Звезда возвращает надежду и показывает новое направление. 6 Мечей означает переход к более спокойной работе.";
const duplicate =
  "5 Кубков снова показывает сожаление о прошлом и задержку движения. Звезда опять возвращает надежду и новое направление. 6 Мечей означает тот же переход к более спокойной работе.";

describe("follow-up stream quality repair", () => {
  beforeEach(() => mocks.streamChat.mockReset());

  it("does not flash the rejected spread and preserves its rejection reason", async () => {
    const upstream = `data: ${JSON.stringify({ choices: [{ delta: { content: duplicate } }] })}\n\ndata: [DONE]\n\n`;
    mocks.streamChat.mockResolvedValue(
      new Response(upstream, { headers: { "Content-Type": "text/event-stream" } })
    );
    let completed: ChatStreamMeta | null = null;
    const response = await createChatResponseStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "скажи хотя бы в каком месяце" }],
      qualityOpts: {
        lastUserMessage: "скажи хотя бы в каком месяце",
        cardNames: cards,
        previousAssistantReply: previous,
      },
      onComplete: async (meta) => {
        completed = meta;
        return {
          reply: "Точный месяц этот расклад не показывает.",
          llmFailed: false,
        };
      },
    });

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(completed?.rejectionReason).toBe("repeating previous spread");
    expect(body).not.toContain('"token"');
    expect(body).not.toContain(duplicate);
    expect(body).toContain("Точный месяц этот расклад не показывает.");
    expect(body).toContain('"llmFailed":false');
  });

  it("waits for the complete multi-chunk answer before duplicate evaluation", async () => {
    const prefix =
      "5 Кубков показывает сожаление о прошлом, Звезда возвращает надежду, а 6 Мечей описывает переход к более спокойной работе.";
    const conclusion =
      " Но точный месяц эти символы не называют. Честный ориентир здесь не календарный: сначала должен завершиться текущий этап переговоров; дату лучше не придумывать.";
    const upstream = [prefix, conclusion]
      .map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
      .join("") + "data: [DONE]\n\n";
    mocks.streamChat.mockResolvedValue(new Response(upstream));

    const response = await createChatResponseStream({
      systemPrompt: "system",
      messages: [{ role: "user", content: "скажи хотя бы в каком месяце" }],
      qualityOpts: {
        cardNames: cards,
        previousAssistantReply: previous,
      },
      onComplete: async (meta) => ({
        reply: meta.reply,
        llmFailed: meta.llmFailed,
      }),
    });

    const body = await response!.text();
    expect(body).toContain("точный месяц");
    expect(body).toContain('"llmFailed":false');
  });
});
