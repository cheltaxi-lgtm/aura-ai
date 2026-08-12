/**
 * Single-block refine: practitioner rewrites one report section with an
 * instruction («теплее», «короче», «без нумерологии») instead of regenerating
 * the whole report. Charged as `refine_block` (cheaper than generate_draft).
 */

import { completeChat, type ChatMessage } from "@/lib/llm";
import type { ProReportBlock } from "../domain/types";
import { filterPractitionerOutput } from "../safety";
import { polishProReportPlainText, polishProReportTitle } from "./report-plain";

export async function refineProReportBlock(params: {
  block: ProReportBlock;
  instruction: string;
  clientAlias: string;
  question?: string | null;
}): Promise<ProReportBlock | null> {
  const instruction = params.instruction.trim().slice(0, 500);
  if (!instruction) return null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `Ты — редактор премиум-отчёта эзотерической практики. Переписываешь ОДНУ секцию по инструкции практика.
Правила:
— Обращение к клиенту на «Вы» (отчёт читает сам клиент).
— Без диагнозов, медицинских/финансовых/юридических советов и категоричных предсказаний («точно будет», «неизбежно»).
— Сохраняй структуру и примерный объём секции, если инструкция не просит иное.
— Верни ТОЛЬКО новый текст секции: без заголовка, без «Вот переписанный текст», без комментариев.`,
    },
    {
      role: "user",
      content: `Секция «${params.block.title}» (клиент: ${params.clientAlias}${
        params.question ? `, фокус запроса: ${params.question}` : ""
      }):

${params.block.body}

Инструкция практика: ${instruction}`,
    },
  ];

  const text = await completeChat({
    messages,
    maxTokens: 3000,
    isPaid: true,
    priority: "report",
  });
  if (!text?.trim()) return null;

  const filtered = filterPractitionerOutput(text.trim());
  return {
    ...params.block,
    title: polishProReportTitle(params.block.title),
    body: polishProReportPlainText(filtered.text),
  };
}
