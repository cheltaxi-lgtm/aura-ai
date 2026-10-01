import { createChatResponseStream } from "@/lib/chat-stream";
import { photoInterpretationMaxTokens } from "@/lib/photo-reading-prompts";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { assessPhotoInterpretation, normalizePhotoInterpretation } from "@/lib/photo-reading-quality";
import type { AiFailureCode } from "@/lib/ai-generation-contract";
import { MAX_PHOTO_CARDS } from "@/lib/photo-reading-constants";

export { hasPhotoInterpretationDepth, normalizePhotoInterpretation } from "@/lib/photo-reading-quality";

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
    `Дай полную персональную расшифровку всех ${n} символов: отдельный развёрнутый абзац по каждой позиции, затем финальный блок выводов. Разделяй абзацы пустой строкой. Без удержания и без короткого «тизера».`,
    "Если название карты указано неточно или содержит варианты, прямо скажи в её отдельном абзаце, что карта не определена точно. Трактуй только достоверно распознанные признаки, не выбирай один вариант как факт.",
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
  failureCode?: AiFailureCode;
  failureDetail?: string;
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
    modelFamily: "paid",
    validatorVersion: "photo-coverage-v2",
    inputParts: [params.userName, params.spreadSummary, params.question ?? "", n],
    maxTokens: photoInterpretationMaxTokens(n),
    temperature: 0.65,
    timeoutMs: 120_000,
    validate: (text) => {
      const assessment = assessPhotoInterpretation(text, n, params.spreadSummary);
      return assessment.ok
        ? { ok: true }
        : { ok: false, code: "validation_failed", detail: assessment.detail };
    },
    buildRepairMessages: (failedText, detail) => [
      ...messages,
      { role: "assistant", content: failedText },
      {
        role: "user",
        content:
          "Перепиши целиком: первая фраза отвечает на вопрос; отдельный содержательный абзац по каждой позиции с названием символа; в конце общий вывод без повтора. Разделяй абзацы пустой строкой. Неопределённые карты называй неопределёнными и не приписывай им точное название. Только чистый текст, без Markdown, звёздочек и заголовков." +
          (/^missing_card_positions:[\d,]+$/u.test(detail ?? "")
            ? ` Не хватает отдельного разбора позиций: ${detail!.split(":")[1]}.` : ""),
      },
    ],
  });
  if (outcome.ok) {
    const { normalizeClientTyAddress, softenShoutyClientName } = await import(
      "@/lib/reading-quality-gate"
    );
    let reply = normalizePhotoInterpretation(outcome.content);
    reply = normalizeClientTyAddress(reply);
    reply = softenShoutyClientName(reply, params.userName);
    return { reply, llmFailed: false, provenance: outcome.provenance };
  }
  // Fail-closed: never substitute template prose for a failed photo reading.
  // Only fixed validator categories/position numbers may enter logs or job errors.
  // Provider detail can contain sensitive material and must never be forwarded.
  const detail = outcome.detail ?? "";
  const positions = /^missing_card_positions:([\d,]+)$/u.exec(detail)?.[1].split(",");
  const safePositions = positions && positions.length <= Math.min(n, MAX_PHOTO_CARDS) &&
    positions.every(value => /^[1-9]\d?$/u.test(value) && Number(value) <= Math.min(n, MAX_PHOTO_CARDS));
  const failureDetail = outcome.code === "validation_failed" &&
    (/^(?:insufficient_length|insufficient_paragraphs|invalid_spread_summary)$/u.test(detail) || safePositions)
    ? detail : undefined;
  console.warn("[photo-reading] generation rejected", { code: outcome.code, detail: failureDetail, cardCount: n });
  return { reply: "", llmFailed: true, failureCode: outcome.code, failureDetail };
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
    holdTokensUntilAccepted: true,
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
      const normalized = normalizePhotoInterpretation(meta.reply);
      const assessment = assessPhotoInterpretation(normalized, n, params.spreadSummary);
      const llmFailed = meta.llmFailed || !assessment.ok;
      if (llmFailed) {
        console.warn("[photo-reading] stream rejected", {code: meta.llmFailed ? "generation_failed" : "validation_failed", detail: assessment.detail, cardCount: n});
      }
      // Fail-closed: never substitute template prose for a failed photo reading.
      const reply = llmFailed ? "" : normalized;
      const extras = await params.onComplete({ reply, llmFailed });
      return {
        ...extras,
        reply: typeof extras.reply === "string" ? extras.reply : reply,
        llmFailed: typeof extras.llmFailed === "boolean" ? extras.llmFailed : llmFailed,
      };
    },
  });
}
