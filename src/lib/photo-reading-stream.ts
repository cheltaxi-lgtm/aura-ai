import { createChatResponseStream } from "@/lib/chat-stream";
import { photoInterpretationMaxTokens } from "@/lib/photo-reading-prompts";
import { wrapSystemPrompt } from "@/lib/prompt-policy";

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
}): Promise<{
  reply: string;
  llmFailed: boolean;
  provenance?: import("@/lib/ai-generation-contract").AiProvenance;
}> {
  const n = Math.max(1, params.cardCount ?? 1);
  // Streaming path wraps inside createChatResponseStream; JSON path must wrap here
  // or the async/mobile clients lose the honesty and dark-topics policies.
  const systemPrompt = await wrapSystemPrompt(params.systemPrompt);
  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: buildPhotoInterpretationUserBlock({
        spreadSummary: params.spreadSummary,
        question: params.question,
        cardCount: n,
      }),
    },
  ];
  const { generateValidatedAiText } = await import("@/lib/validated-ai-generation");
  const outcome = await generateValidatedAiText({
    messages,
    inputParts: [params.userName, params.spreadSummary, params.question ?? "", n],
    maxTokens: photoInterpretationMaxTokens(n),
    temperature: 0.65,
    timeoutMs: 120_000,
    validate: (text) => {
      const trimmed = text.trim();
      if (trimmed.length < 200) {
        return { ok: false, code: "validation_failed", detail: "too_short" };
      }
      // Soft structure: verdict signal or closing section — card names live in spreadSummary prose.
      const hasClose =
        /##\s*Простыми словами/iu.test(trimmed) ||
        /вердикт|в плюс|жёстк|жестк|если коротко|в сумме/iu.test(trimmed.slice(0, 400)) ||
        /вердикт|в плюс|жёстк|жестк|итог/iu.test(trimmed.slice(-700));
      return hasClose
        ? { ok: true }
        : { ok: false, code: "validation_failed", detail: "missing_verdict_or_finale" };
    },
    buildRepairMessages: (failedText) => [
      ...messages,
      { role: "assistant", content: failedText },
      {
        role: "user",
        content:
          "Перепиши целиком: первая фраза — вердикт; отдельный абзац по каждой позиции с названием символа; в конце полный финальный блок (для таро — «## Простыми словами»). Без воды.",
      },
    ],
  });
  if (outcome.ok) {
    return { reply: outcome.content.trim(), llmFailed: false, provenance: outcome.provenance };
  }
  // Fail-closed: never substitute template prose for a failed photo reading.
  return { reply: "", llmFailed: true };
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
