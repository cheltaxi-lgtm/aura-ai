import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { HD_REPORT_REQUIRED_SECTIONS } from "./packages";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Which required ## headings are still missing from a draft. */
export function missingHdReportSections(text: string): string[] {
  const body = text || "";
  // Avoid \\b — JS word boundaries do not treat Cyrillic as word chars.
  return HD_REPORT_REQUIRED_SECTIONS.filter(
    (title) => !new RegExp(`^##\\s*${escapeRe(title)}(?:\\s|$|[.!?…])`, "im").test(body)
  );
}

function buildContinuePrompt(missing: string[]): string {
  const list = missing.map((t) => `## ${t}`).join("\n");
  return (
    `Текст разбора выше ещё неполный — оборвался или пропущены разделы.\n` +
    `Продолжи РОВНО с места остановки. Не повторяй уже написанные разделы.\n` +
    `Обязательно допиши ВСЕ недостающие разделы с этими точными заголовками ##:\n${list}\n\n` +
    `В каждом новом разделе: механика → жизнь → 1–2 бытовых примера → что делать. ` +
    `Для «Девять центров» и «Каналы» используй ### на каждый центр/канал. ` +
    `Пиши развёрнуто — это полный премиальный продукт, не краткое резюме.`
  );
}

/**
 * Fat HD personal report: high token budget + continue until all ##
 * sections exist or passes are exhausted.
 */
export async function completeHdFullReport(opts: {
  systemPrompt: string;
  evidence: string;
  clientName: string | null;
}): Promise<string | null> {
  const who = opts.clientName ?? "клиента";
  const system: ChatMessage = { role: "system", content: opts.systemPrompt };
  const seedUser: ChatMessage = {
    role: "user",
    content:
      `РАСЧЁТНЫЕ ДАННЫЕ:\n${opts.evidence}\n\n` +
      `Напиши ПОЛНЫЙ премиальный разбор Дизайна Человека для ${who}.\n` +
      `Это единственная покупка клиента — глубина уровня полной расшифровки конкурентов (все обязательные ## из системного промпта).\n` +
      `Не сокращай. Не пропускай разделы. Цель: 5500–8000 слов, с ### внутри Центров и Каналов.`,
  };

  let combined = "";
  const maxPasses = 4;

  for (let pass = 0; pass < maxPasses; pass++) {
    const messages: ChatMessage[] =
      pass === 0
        ? [system, seedUser]
        : [
            system,
            seedUser,
            { role: "assistant", content: combined },
            {
              role: "user",
              content: (() => {
                const missing = missingHdReportSections(combined);
                return missing.length
                  ? buildContinuePrompt(missing)
                  : "Текст оборвался на лимите. Продолжи ровно с места остановки без повтора. Допиши оставшиеся разделы до полного премиального объёма.";
              })(),
            },
          ];

    const result = await completeChatDetailed({
      messages,
      maxTokens: pass === 0 ? 12_000 : 8_000,
      temperature: 0.62,
      isPaid: true,
      timeoutMs: 120_000,
      skipTemperatureRetry: true,
    });

    const chunk = (result.text || "").trim();
    if (!chunk) break;

    combined = combined ? `${combined.trim()}\n\n${chunk}` : chunk;

    const missing = missingHdReportSections(combined);
    const hitLength = result.finishReason === "length";
    if (!hitLength && missing.length === 0) {
      return combined;
    }
  }

  return combined.trim() || null;
}
