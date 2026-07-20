import { createChatResponseStream } from "@/lib/chat-stream";
import {
  photoInterpretationMaxTokens,
  photoReadingFallback,
} from "@/lib/photo-reading-prompts";

export async function createPhotoInterpretationStream(params: {
  systemPrompt: string;
  spreadSummary: string;
  question?: string;
  userName: string;
  cardCount?: number;
  onComplete: (meta: { reply: string; llmFailed: boolean }) => Promise<Record<string, unknown>>;
}): Promise<Response | null> {
  const questionLine = params.question?.trim()
    ? `Вопрос клиента: «${params.question.trim()}» — ответь через все символы расклада.`
    : "";

  const n = Math.max(1, params.cardCount ?? 1);
  const userBlock = [
    params.spreadSummary,
    questionLine,
    `Дай полную персональную расшифровку всех ${n} символов: отдельный развёрнутый абзац по каждой позиции, затем финальный блок выводов. Без удержания и без короткого «тизера».`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return createChatResponseStream({
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: userBlock }],
    temperature: 0.65,
    maxTokens: photoInterpretationMaxTokens(n),
    onComplete: async (meta) => {
      const llmFailed = meta.llmFailed || !meta.reply.trim();
      const reply = llmFailed ? photoReadingFallback(params.userName) : meta.reply;
      const extras = await params.onComplete({ reply, llmFailed });
      return { ...extras, reply, llmFailed };
    },
  });
}
