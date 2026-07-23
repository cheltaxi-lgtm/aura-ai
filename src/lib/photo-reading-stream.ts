import { createChatResponseStream } from "@/lib/chat-stream";
import { completeChat } from "@/lib/llm";
import { photoInterpretationMaxTokens } from "@/lib/photo-reading-prompts";

function buildPhotoInterpretationUserBlock(params: {
  spreadSummary: string;
  question?: string;
  cardCount?: number;
}): string {
  const questionLine = params.question?.trim()
    ? `Вопрос клиента: «${params.question.trim()}» — ответь через все символы расклада.`
    : "";

  const n = Math.max(1, params.cardCount ?? 1);
  return [
    params.spreadSummary,
    questionLine,
    `Дай полную персональную расшифровку всех ${n} символов: отдельный развёрнутый абзац по каждой позиции, затем финальный блок выводов. Без удержания и без короткого «тизера».`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Non-stream JSON path for durable worker / async poll clients. */
export async function createPhotoInterpretationJson(params: {
  systemPrompt: string;
  spreadSummary: string;
  question?: string;
  userName: string;
  cardCount?: number;
}): Promise<{ reply: string; llmFailed: boolean }> {
  const n = Math.max(1, params.cardCount ?? 1);
  const text = await completeChat({
    messages: [
      { role: "system", content: params.systemPrompt },
      {
        role: "user",
        content: buildPhotoInterpretationUserBlock({
          spreadSummary: params.spreadSummary,
          question: params.question,
          cardCount: n,
        }),
      },
    ],
    temperature: 0.65,
    maxTokens: photoInterpretationMaxTokens(n),
    timeoutMs: 120_000,
    maxAttempts: 2,
  });
  const reply = typeof text === "string" ? text.trim() : "";
  // Fail-closed: never substitute template prose for a failed photo reading.
  if (!reply) return { reply: "", llmFailed: true };
  return { reply, llmFailed: false };
}

export async function createPhotoInterpretationStream(params: {
  systemPrompt: string;
  spreadSummary: string;
  question?: string;
  userName: string;
  cardCount?: number;
  onComplete: (meta: { reply: string; llmFailed: boolean }) => Promise<Record<string, unknown>>;
}): Promise<Response | null> {
  const n = Math.max(1, params.cardCount ?? 1);

  return createChatResponseStream({
    systemPrompt: params.systemPrompt,
    messages: [
      {
        role: "user",
        content: buildPhotoInterpretationUserBlock({
          spreadSummary: params.spreadSummary,
          question: params.question,
          cardCount: n,
        }),
      },
    ],
    temperature: 0.65,
    maxTokens: photoInterpretationMaxTokens(n),
    onComplete: async (meta) => {
      const llmFailed = meta.llmFailed || !meta.reply.trim();
      // Fail-closed: never substitute template prose for a failed photo reading.
      const reply = llmFailed ? "" : meta.reply;
      const extras = await params.onComplete({ reply, llmFailed });
      return { ...extras, reply, llmFailed };
    },
  });
}
