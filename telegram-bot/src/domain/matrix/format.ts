/** Premium matrix copy for Telegram (emoji allowed here — product surface). */

export type MatrixTeaserInput = {
  name?: string | null;
  birthDate?: string | null;
  portrait?: string | null;
  moneyInsight?: string | null;
  loveInsight?: string | null;
  yearInsight?: string | null;
  keyArcana?: Array<{ role: string; number: number; title: string; shortMeaning: string }>;
  cost?: number;
  runeBalance?: number | null;
};

const ROLE_EMOJI: Record<string, string> = {
  Предназначение: "✨",
  Деньги: "💰",
  Отношения: "💞",
  "Аркан года": "📅",
  "Денежный канал": "💰",
};

function cleanInsight(raw: string): string {
  return raw.replace(/^(Денежный канал|Отношения|Аркан года):\s*/i, "").trim();
}

/** Free teaser under the diagram — when full report is not owned yet. */
export function formatMatrixPremiumTeaser(input: MatrixTeaserInput): string {
  const arcs = (input.keyArcana || [])
    .map((a) => {
      const emoji = ROLE_EMOJI[a.role] || "🔮";
      return `${emoji} ${a.role}: ${a.title} (${a.number})\n${a.shortMeaning}`;
    })
    .join("\n\n");

  const lines = [
    "🌌 Матрица судьбы",
    input.birthDate ? `🎂 Дата рождения: ${input.birthDate}` : "",
    "",
    input.portrait ? `🕯 ${input.portrait}` : "",
    "",
    arcs,
    "",
    input.moneyInsight ? `💰 ${cleanInsight(input.moneyInsight)}` : "",
    input.loveInsight ? `💞 ${cleanInsight(input.loveInsight)}` : "",
    input.yearInsight ? `📅 ${cleanInsight(input.yearInsight)}` : "",
    "",
    "————————————",
    `✨ Полный разбор Эвелины — разовая покупка · ${input.cost ?? 20}ᚢ`,
    typeof input.runeBalance === "number" ? `🪙 На балансе: ${input.runeBalance}ᚢ` : "",
    "",
    "Нажмите «Получить матрицу», чтобы открыть полный расклад.",
  ];

  return lines.filter((x) => x !== "").join("\n");
}

/**
 * Decorate a full matrix reading with section emoji for premium Telegram paging.
 */
export function formatMatrixReadingPremium(raw: string): string {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  const replacements: Array<[RegExp, string]> = [
    [/^(#{1,3}\s*)?(Предназначение)\s*:?\s*$/gim, "✨ $2"],
    [/^(#{1,3}\s*)?(Тело и характер|Характер|Тело)\s*:?\s*$/gim, "🜁 $2"],
    [/^(#{1,3}\s*)?(Энергия)\s*:?\s*$/gim, "⚡ $2"],
    [/^(#{1,3}\s*)?(Род и корни|Корни|Род)\s*:?\s*$/gim, "🌳 $2"],
    [/^(#{1,3}\s*)?(Таланты)\s*:?\s*$/gim, "💎 $2"],
    [/^(#{1,3}\s*)?(Отношения|Любовь)\s*:?\s*$/gim, "💞 $2"],
    [/^(#{1,3}\s*)?(Деньги|Финансы)\s*:?\s*$/gim, "💰 $2"],
    [/^(#{1,3}\s*)?(Род отца)\s*:?\s*$/gim, "🕯 $2"],
    [/^(#{1,3}\s*)?(Род матери)\s*:?\s*$/gim, "🌙 $2"],
    [/^(#{1,3}\s*)?(Карма)\s*:?\s*$/gim, "♻️ $2"],
    [/^(#{1,3}\s*)?(Аркан года|Личный год)\s*:?\s*$/gim, "📅 $2"],
    [/^(#{1,3}\s*)?(Практика|Шаги|Что делать)\s*:?\s*$/gim, "🪴 $2"],
    [/^(#{1,3}\s*)?(Итог|Вывод|Общий вывод|Краткое резюме)\s*:?\s*$/gim, "✦ $2"],
    [/^(#{1,3}\s*)?(Простыми словами)\s*:?\s*$/gim, "🕯 $2"],
  ];

  for (const [re, rep] of replacements) {
    text = text.replace(re, rep);
  }

  if (!/^🌌/m.test(text)) {
    text = `🌌 Матрица судьбы\n\n${text}`;
  }
  return text;
}
