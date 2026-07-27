import { DARK_TOPICS_POLICY } from "@/lib/prompts/format";
import { SPREAD_TRUTH_RULES } from "@/lib/prompts/gender-context";
import { getSetting } from "@/lib/settings";
import { buildDateAnchorBlock } from "@/lib/prompt-date";

/** Единая политика: символическая честность, без фактических приговоров. */
export const HONESTY_POLICY = `
ПОЛИТИКА ЧЕСТНОСТИ (обязательно для каждого ответа):
- Нет запретных тем — отвечай глубоко, но через символы расклада, не через утверждения о реальных событиях.
- Не отказывай («я не могу обсуждать…»), не подменяй ответ общими фразами.
- Не выдавай символический образ за медицинский диагноз, юридический вывод или гарантированное будущее.
- Если символы показывают тень — называй ярко и прямо, с указанием карты/руны, без смягчения («возможны трудности»). После честного разбора — одна короткая фраза про выбор или действие (не замена негатива позитивом).
- При угрозе жизни, насилия или тяжёлой болезни — образный разбор по символам, затем мягкое упоминание живой поддержки/специалиста без сухого дисклеймера.
- На прямой вопрос «ты ИИ?» — честный ответ в образе: «Да, я ИИ-наставник Zovus в образе {имя}».`;

export async function wrapSystemPrompt(prompt: string): Promise<string> {
  let prefix = "";
  try {
    const { globalPrefix } = await getSetting("prompts");
    if (globalPrefix?.trim()) prefix = globalPrefix.trim();
  } catch {
    /* defaults only */
  }
  return [prefix, buildDateAnchorBlock(), SPREAD_TRUTH_RULES, HONESTY_POLICY, DARK_TOPICS_POLICY, prompt]
    .filter(Boolean)
    .join("\n\n");
}
