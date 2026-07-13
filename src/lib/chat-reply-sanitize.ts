/** Client-safe reply sanitizers (no server/DB imports). */

import {
  polishSpreadReadingText,
  stripEnglishLeakageFromRussianText,
} from "@/lib/reading-text-polish";

/** Remove theater / voice stage directions like «(Голос низкий, хриплый…)». */
export function stripStageDirections(text: string): string {
  let out = text.trim();
  if (!out) return out;

  for (let i = 0; i < 4; i++) {
    const lead = out.match(/^\([^)]{3,220}\)\s*(?:\/|\||[-–—])?\s*/u);
    if (!lead) break;
    out = out.slice(lead[0].length).trim();
  }

  out = out.replace(
    /\([^)]*(?:голос|шепч|хрип|пауз|тихо|громко|будто|из глубин|задумч|усмех|вздых|медленн|интонац)[^)]*\)\s*/giu,
    ""
  );

  out = out.replace(/^\s*[/\-–—|]\s*/, "").replace(/\s{2,}/g, " ").trim();
  return out;
}

/** Strip stage directions in parentheses, asterisks, and bracketed asides. */
export function stripTheaterFromReply(text: string): string {
  let out = stripStageDirections(text);

  out = out.replace(/\*[^*\n]{2,120}\*/g, " ");
  out = out.replace(/(?<!!)\[[^\]\n]{2,120}\]/g, " ");
  out = out.replace(
    /\([^)]{2,160}(?:вздых|смотр|шепч|пауз|голос|задум|усмех|медлен|интонац|тяжел|хрип|тихо|громко|задумч)[^)]{0,120}\)/giu,
    ""
  );

  return stripEnglishLeakageFromRussianText(
    out.replace(/\n{3,}/g, "\n\n").replace(/  +/g, " ").trim()
  );
}

function normalizeCompareText(text: string): string {
  return text
    .replace(/\*\*[^*]+\*\*/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/[#*_`~[\]()]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Same phrase (5+ words) repeated 3+ times — semantic LLM loop. */
export function hasRepeatedPhrase(text: string, minWords = 5, minOccurrences = 3): boolean {
  const words = normalizeCompareText(text)
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < minWords * minOccurrences) return false;

  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - minWords; i++) {
    const phrase = words.slice(i, i + minWords).join(" ");
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= minOccurrences) return true;
  }
  return false;
}

/** Assistant pasted the user's message (or a full line of it) without interpretation. */
export function isEchoingUserMessage(reply: string, userMessage?: string): boolean {
  const user = userMessage?.trim();
  if (!user || user.length < 12) return false;

  const userNorm = user.replace(/\s+/g, " ").trim();
  const replyFlat = reply.replace(/\s+/g, " ").trim();

  if (userNorm.length >= 20 && replyFlat.includes(userNorm)) return true;

  for (const line of reply.split(/\n+/)) {
    const lineNorm = line.replace(/\s+/g, " ").trim();
    if (lineNorm.length < 12) continue;
    if (lineNorm === userNorm) return true;
    if (userNorm.length >= 20 && lineNorm.includes(userNorm)) return true;
  }
  return false;
}

/** Three symbol blocks share the same interpretation core (tarot/rune chat loop). */
export function hasDuplicateSymbolInterpretations(text: string): boolean {
  const blocks: string[] = [];
  for (const line of text.split(/\n+/)) {
    const m = line.match(/\*\*([^*]{2,60})\*\*(.+)/u);
    if (!m) continue;
    let core = normalizeCompareText(m[2] ?? "");
    core = core.replace(/^.*?\bчто\b\s+/u, "").trim();
    if (core.length >= 12) blocks.push(core);
  }
  if (blocks.length < 3) return false;

  const counts = new Map<string, number>();
  for (const b of blocks) counts.set(b, (counts.get(b) ?? 0) + 1);
  return Math.max(...counts.values()) >= 3;
}

export type ChatReplyQualityOpts = {
  lastUserMessage?: string;
  cardNames?: string[];
};

/** Chat-specific quality gate (loop, echo, lazy symbol blocks). */
export function isRejectedChatReply(text: string, opts?: ChatReplyQualityOpts): boolean {
  if (isDegenerateLlmOutput(text)) return true;
  if (hasRepeatedPhrase(text)) return true;
  if (hasDuplicateSymbolInterpretations(text)) return true;
  if (opts?.lastUserMessage && isEchoingUserMessage(text, opts.lastUserMessage)) return true;
  return false;
}

export function chatReplyRejectionReason(text: string, opts?: ChatReplyQualityOpts): string | null {
  if (isDegenerateLlmOutput(text)) return "degenerate output";
  if (hasRepeatedPhrase(text)) return "repeated phrase loop";
  if (hasDuplicateSymbolInterpretations(text)) return "duplicate symbol interpretations";
  if (opts?.lastUserMessage && isEchoingUserMessage(text, opts.lastUserMessage)) {
    return "echoing user message";
  }
  return null;
}

export function isDegenerateLlmOutput(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  const flat = t.replace(/\s+/g, " ").trim();

  if (/^(?:\d+\.\s*){5,}/.test(flat)) return true;
  if (/^(?:1\.\s*){4,}/.test(flat)) return true;

  // Numbered-list spam anywhere in the text (e.g. "Ты — эксперт. 1. 2. 3. 4. 5. 6. ...").
  if (/(?:\b\d{1,4}\.\s+){6,}/.test(flat)) return true;

  if (t.length < 24) return false;

  const tokens = flat.split(" ").filter(Boolean);
  if (tokens.length >= 10) {
    const counts = new Map<string, number>();
    for (const tok of tokens) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    const top = Math.max(...counts.values());
    if (top / tokens.length >= 0.55) return true;
  }

  // Bare-number enumeration storm: a large share of tokens are just "N" or "N.".
  if (tokens.length >= 15) {
    const numberTokens = tokens.filter((tok) => /^\d{1,4}\.?$/.test(tok)).length;
    if (numberTokens / tokens.length >= 0.35) return true;
  }

  if (/(.{2,30})\1{4,}/u.test(flat)) return true;

  const lines = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 6) {
    const lineCounts = new Map<string, number>();
    for (const line of lines) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
    const topLine = Math.max(...lineCounts.values());
    if (topLine / lines.length >= 0.5) return true;
  }

  const normalizedLines = lines
    .map((l) => normalizeCompareText(l))
    .filter((l) => l.length >= 16);
  if (normalizedLines.length >= 3) {
    const normCounts = new Map<string, number>();
    for (const line of normalizedLines) {
      normCounts.set(line, (normCounts.get(line) ?? 0) + 1);
    }
    if (Math.max(...normCounts.values()) >= 3) return true;
  }

  if (hasRepeatedPhrase(flat)) return true;

  return false;
}

const MEMORY_LEAK_MARKERS = [
  "ГЛОБАЛЬНАЯ ПАМЯТЬ КЛИЕНТА",
  "ДОЛГОСРОЧНАЯ ПАМЯТЬ О КЛИЕНТЕ",
  "БЛИЖАЙШИЕ СОБЫТИЯ:",
  "Сохранённые расклады (от новых к старым)",
  "Сохранённые расклады",
  "Переписка с мастерами:",
  "Профиль и запрос:",
  "ПРОФИЛЬ КЛИЕНТА",
  "Профиль клиента:",
  "ПАМЯТЬ О ПРОШЛЫХ",
];

const PROMPT_LEAK_PATTERNS = [
  /блок памяти/i,
  /системного промпта/i,
  /Минимум 22 предложения/i,
  /Минимум 500 слов/i,
  /500\+?\s*слов/i,
  /имя\s*\d+\+?\s*раз/i,
  /знак\s*\d+\+?\s*раз/i,
  /конкретика по картам/i,
  /Строго по структуре/i,
  /Строго 500/i,
  /Без markdown/i,
  /не цитируй/i,
  /не выводи.*клиенту/i,
  /УГЛЫ ТЕМЫ/i,
  /РЕЖИМ: ОПЛАЧЕННЫЙ/i,
  /ЗАПРЕЩЁННАЯ «ВОДА»/i,
  /ОБЯЗАТЕЛЬНАЯ СТРУКТУРА/i,
  /ТЕСТ ПЕРСОНАЛИЗАЦИИ/i,
  /--- КОНЕЦ ИНСТРУКЦИЙ ---/i,
  /Главный вопрос: «/,
  /Тема жизни:/,
  /служебные данные/i,
  /не включать в ответ/i,
];

const READING_CUT_MARKERS = [
  "Строго по структуре",
  "Строго 500",
  "Минимум 22 предложения",
  "Минимум 500 слов",
  "Имя пользователя — минимум",
  "Знак зодиака — минимум",
  "ТЕСТ ПЕРСОНАЛИЗАЦИИ",
  "ОБЯЗАТЕЛЬНАЯ СТРУКТУРА",
  "ТРЕБОВАНИЯ:",
  "ВНУТРЕННИЕ ТРЕБОВАНИЯ",
  "--- КОНЕЦ ИНСТРУКЦИЙ ---",
  "Без markdown",
  "Профиль клиента",
  "ПРОФИЛЬ КЛИЕНТА",
  "блок памяти",
  "Блок памяти",
  "ВАЖНО: блок",
  "Главный вопрос:",
  "Тема жизни:",
  "УГЛЫ ТЕМЫ",
  "системного промпта",
  "служебные данные",
  ...MEMORY_LEAK_MARKERS,
];

/** Model echoed internal prompt / profile / rules instead of a reading. */
export function isPromptLeakInReading(text: string): boolean {
  return PROMPT_LEAK_PATTERNS.some((p) => p.test(text));
}

/** Model echoed a checklist like «(Строго 500+ слов; имя 4+ раза…)» at the end. */
export function stripTrailingPromptChecklist(text: string): string {
  let out = text.trim();
  if (!out) return out;

  for (let pass = 0; pass < 3; pass++) {
    const trailingParen = out.match(
      /\s*[\(\[][^)\]]{6,280}(?:500\+?\s*слов|имя\s*\d+\+?\s*раз|знак\s*\d+\+?\s*раз|конкретика по картам|без воды|минимум\s*\d+\s*слов|строго\s*500)[^)\]]*[\)\]]\s*$/iu
    );
    if (!trailingParen) break;
    out = out.slice(0, -trailingParen[0].length).trim();
  }

  const lines = out.split(/\n+/);
  while (lines.length > 1) {
    const last = lines[lines.length - 1]?.trim() ?? "";
    if (
      /^[\(\[][^)\]]{6,280}[\)\]]$/u.test(last) &&
      /(?:500|имя|знак|конкретика|без воды|минимум|строго)/iu.test(last)
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join("\n").trim();
}

/** Minimum card name mentions required for a reading to pass validation. */
export function minCardMentionsRequired(cardCount: number): number {
  if (cardCount <= 1) return 1;
  if (cardCount <= 3) return cardCount;
  return Math.min(cardCount, Math.max(3, Math.ceil(cardCount * 0.5)));
}

/** Client-safe reading text — strips leaks; returns empty if unusable. */
export function sanitizeReadingForClient(
  text: string,
  cardNames?: string[]
): string {
  let out = text.trim();
  if (!out) return out;

  out = polishSpreadReadingText(out, cardNames);

  out = stripTrailingPromptChecklist(out);

  for (const marker of READING_CUT_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx >= 0) out = out.slice(0, idx).trim();
  }

  out = stripMemoryLeakFromReply(out);
  if (!out || isDegenerateLlmOutput(out) || isPromptLeakInReading(out)) return "";

  if (cardNames?.length) {
    const numericSpread = cardNames.every((name) => /^\d+$/.test(name.trim()));
    if (!numericSpread) {
      const mentioned = cardNames.filter((name) => {
        const relaxed = name.replace(/ё/g, "е");
        return out.includes(name) || out.includes(relaxed);
      });
      const minMentions = minCardMentionsRequired(cardNames.length);
      const minLength = Math.max(900, cardNames.length * 120);
      if (mentioned.length < minMentions && out.length < minLength) return "";
    }
  }

  return out.trim();
}

/** Prefer sanitized reading; keep server fallback if sanitizer is too strict. */
export function resolveClientReadingText(
  raw: string | undefined | null,
  cardNames?: string[]
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return "";
  const cleaned = sanitizeReadingForClient(trimmed, cardNames);
  if (cleaned) return cleaned;
  const stripped = stripTrailingPromptChecklist(stripMemoryLeakFromReply(trimmed));
  if (stripped && !isDegenerateLlmOutput(stripped)) return stripped;
  return "";
}

/** Remove internal memory block if the model echoed it into the reply. */
export function stripMemoryLeakFromReply(text: string): string {
  let out = text.trim();
  if (!out) return out;

  for (const marker of MEMORY_LEAK_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx >= 0) out = out.slice(0, idx).trim();
  }

  const historyEcho = out.match(
    /^(?:#{1,3}\s*)?(?:\d+\.\s*)+\[[^\]]+\]\s*Выпал\s+расклад/im
  );
  if (historyEcho && historyEcho.index != null && historyEcho.index < 80) {
    const afterEcho = out.slice(historyEcho.index + historyEcho[0].length).trim();
    if (afterEcho.length >= 40) out = afterEcho;
  }

  if (isDegenerateLlmOutput(out)) return "";

  return out.trim();
}

export const FULL_SPREAD_REQUEST_RE =
  /\b(?:полн(?:ый|ая|ое)?\s+расклад|разв[ёе]рнут(?:ый|ая|ое)?\s+(?:расклад|расшифровк)|(?:сделай|делай)\s+(?:полный\s+)?расклад|получ(?:ить|и)\s+расклад)\b/i;
