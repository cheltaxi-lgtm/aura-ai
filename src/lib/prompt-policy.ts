import { DARK_TOPICS_POLICY } from "@/lib/prompts/format";
import { SPREAD_TRUTH_RULES } from "@/lib/prompts/gender-context";
import { getSetting } from "@/lib/settings";

/** Единая политика: без запретных тем, без отказов, максимальная честность. */
export const HONESTY_POLICY = `
ПОЛИТИКА ЧЕСТНОСТИ (обязательно для каждого ответа):
- Ответ строится строго по выпавшим символам и их значениям. Без символа — без утверждения о факте.
- Нет запретных тем — отвечай прямо, но только если это следует из расклада.
- Никогда не отказывай («я не могу обсуждать…»), не подменяй ответ общими фразами.
- Не отправляй к врачу, юристу или психологу вместо разбора — сначала дай ответ по символам.
- Если символы показывают плохое — называй явно, с указанием карты/руны.
- Если символы НЕ показывают плохое — не выдумывай его из вопроса, страха или намерения клиента.
- Если символы показывают хорошее — не скрывай из «осторожности».
- Предельная честность = честность расклада, а не драматизация вопроса.`;

export async function wrapSystemPrompt(prompt: string): Promise<string> {
  let prefix = "";
  try {
    const { globalPrefix } = await getSetting("prompts");
    if (globalPrefix?.trim()) prefix = globalPrefix.trim();
  } catch {
    /* defaults only */
  }
  return [prefix, SPREAD_TRUTH_RULES, HONESTY_POLICY, DARK_TOPICS_POLICY, prompt].filter(Boolean).join("\n\n");
}
