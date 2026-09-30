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

export function normalizePhotoInterpretation(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s*/gmu, "")
    .replace(/\*{1,3}/gu, "")
    .replace(/_{2,3}/gu, "")
    .trim();
}

function normalizeForCoverage(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ");
}

function namesSameCard(paragraph: string, name: string): boolean {
  const words = normalizeForCoverage(name).trim().split(/\s+/u).filter(Boolean);
  const textWords = normalizeForCoverage(paragraph).trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return false;
  // Compare every word of the card name in sequence. Longer stems tolerate
  // Russian inflection; short names require exact words (Суд != Судьба).
  return textWords.some((_, start) => words.every((word, offset) =>
    word.length <= 3
      ? textWords[start + offset] === word
      : textWords[start + offset]?.startsWith(word.slice(0, 4))
  ));
}

export function hasPhotoInterpretationDepth(text: string, cardCount: number, spreadSummary: string): boolean {
  const trimmed = normalizePhotoInterpretation(text);
  const paragraphs = trimmed.split(/\n\s*\n/u).filter(Boolean);
  if (trimmed.length < Math.max(200, cardCount * 90) || paragraphs.length < cardCount + 1) return false;
  const listedCards = Array.from(spreadSummary.matchAll(/^\d+\.\s+(.+)$/gmu), (match) =>
    Array.from(match[1].matchAll(/«([^»]+)»/gu), (name) => name[1])
  );
  if (listedCards.length !== cardCount) return false;
  const usedParagraphs = new Set<number>();
  return listedCards.every((alternatives) => {
    const index = paragraphs.findIndex((paragraph, paragraphIndex) =>
      !usedParagraphs.has(paragraphIndex) && paragraph.length >= 70 &&
      alternatives.some((name) => namesSameCard(paragraph, name))
    );
    if (index < 0) return false;
    usedParagraphs.add(index);
    return true;
  });
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
      return hasPhotoInterpretationDepth(text, n, params.spreadSummary)
        ? { ok: true }
        : { ok: false, code: "validation_failed", detail: "insufficient_card_depth" };
    },
    buildRepairMessages: (failedText) => [
      ...messages,
      { role: "assistant", content: failedText },
      {
        role: "user",
        content:
          "Перепиши целиком: первая фраза отвечает на вопрос; отдельный содержательный абзац по каждой позиции с названием символа; в конце общий вывод без повтора. Только чистый текст, без Markdown, звёздочек и заголовков.",
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
      const llmFailed = meta.llmFailed || !hasPhotoInterpretationDepth(normalized, n, params.spreadSummary);
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
