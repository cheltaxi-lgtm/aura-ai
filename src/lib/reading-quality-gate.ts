/**
 * Premium quality checks for paid spread delivery.
 * Completeness (card names) stays in sanitize / isPaidSpreadTextComplete;
 * this gate catches structure, voice, and density defects.
 */

import { isTarotRuneMasterId } from "@/lib/prompts/tarot-rune-format";

/** JS \b is ASCII-only — Cyrillic needs lookarounds. */
function wordRe(words: string[], flags = "u"): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${words.join("|")})(?!\\p{L})`, flags);
}

const VERDICT_SIGNAL = wordRe([
  "вердикт",
  "жёстк\\w*",
  "жестк\\w*",
  "в плюс",
  "смешанн\\w*",
  "прямо",
  "коротко",
  "шанс\\w*",
  "риск",
  "стоит",
  "не стоит",
  "уходи",
  "оставайся",
  "вернёт\\w*",
  "вернет\\w*",
  "не время",
  "время уход",
  "да",
  "нет",
]);

const TU_WORDS = [
  "ты",
  "тебе",
  "тебя",
  "твой",
  "твоя",
  "твои",
  "твоё",
  "твое",
  "твоего",
  "тобой",
];

/** Full vy-address set — matches audit metrics (ваш* included). */
const VY_ADDRESS_WORDS = [
  "вы",
  "вам",
  "вас",
  "вами",
  "ваш",
  "ваша",
  "ваши",
  "ваше",
  "вашем",
  "вашего",
  "вашей",
  "вашу",
  "вашим",
  "вашими",
  "ваших",
  "вашему",
];

/** Phrases banned in prompts — presence means the ban-list is being ignored. */
const HARD_FILLER = [
  "энергетическ",
  "вибраци",
  "флюид",
  "в контексте",
  "с точки зрения",
  "необходимо отметить",
  "следует подчеркнуть",
  "позитивные тенденции",
  "благоприятные перспективы",
  "всё будет хорошо",
  "все будет хорошо",
];

export type ReadingQualityIssue =
  | "too_short"
  | "no_verdict"
  | "missing_simply_words"
  | "mixed_address"
  | "hard_filler"
  | "title_opening";

/**
 * Always-blocking structural defects.
 * Thin text uses a separate hard word-floor inside evaluatePaidReadingQuality.
 */
export const BLOCKING_QUALITY_ISSUES: readonly ReadingQualityIssue[] = [
  "no_verdict",
  "missing_simply_words",
] as const;

export type ReadingQualityResult =
  | { ok: true; issues: ReadingQualityIssue[] }
  | { ok: false; issues: ReadingQualityIssue[]; detail: string };

export function hasBlockingQualityIssues(issues: ReadingQualityIssue[]): boolean {
  return issues.some((i) => (BLOCKING_QUALITY_ISSUES as readonly string[]).includes(i));
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/** Soft floor — listed as too_short for repair hints / metrics. */
function softMinWordsForSpread(cardCount: number): number {
  if (cardCount <= 1) return 120;
  if (cardCount <= 3) return 240;
  if (cardCount <= 5) return 340;
  if (cardCount <= 7) return 420;
  return Math.max(480, cardCount * 55);
}

/**
 * Hard floor for blocking too_short.
 * Below this, prefer repair/failover over shipping a thin paid reading.
 * Soft-ship still allows complete drafts ≥200 chars elsewhere.
 */
export function hardMinWordsForSpread(cardCount: number): number {
  if (cardCount <= 1) return 90;
  if (cardCount <= 3) return 200;
  if (cardCount <= 5) return 280;
  if (cardCount <= 7) return 360;
  return Math.max(420, cardCount * 48);
}

export function meetsPaidDensityFloor(text: string, cardCount: number): boolean {
  return countWords(text) >= hardMinWordsForSpread(cardCount);
}

export function hasSimplyWordsSection(text: string): boolean {
  return /##\s*Простыми словами/iu.test(text);
}

function hasVerdictSignal(text: string): boolean {
  const head = text.trim().slice(0, 420);
  if (VERDICT_SIGNAL.test(head.toLowerCase())) return true;
  const simply = text.match(/##\s*Простыми словами\s*([\s\S]{0,500})/iu);
  if (simply?.[1] && VERDICT_SIGNAL.test(simply[1].toLowerCase())) return true;
  return false;
}

function stripQuotedAndBold(text: string): string {
  return text
    .replace(/\*\*[^*\n]{1,120}\*\*/gu, " ")
    .replace(/[«"][^»"\n]{1,80}[»"]/gu, " ");
}

function mixesTuVyAddress(text: string): boolean {
  // Ignore position labels like «Вы» and bold card titles.
  const lower = stripQuotedAndBold(text).toLowerCase();
  const tu = wordRe(TU_WORDS).test(lower);
  const vy = wordRe(VY_ADDRESS_WORDS).test(lower);
  return tu && vy;
}

function hardFillerHits(text: string): string[] {
  const lower = text.toLowerCase();
  return HARD_FILLER.filter((p) => lower.includes(p));
}

function opensWithTitleScaffold(text: string): boolean {
  const head = text.trim().slice(0, 120);
  return /^\*{0,2}\s*Расклад\s+для/iu.test(head) || /^#{2,3}\s+/u.test(head);
}

function masterUsesTy(characterId?: string | null): boolean {
  if (!characterId) return true;
  return characterId !== "gadalka_marina";
}

/**
 * Convert client-facing «вы» forms to «ты» for masters on ты.
 * Protects quoted labels (e.g. позиция «Вы») and **bold** spans.
 */
export function normalizeClientTyAddress(text: string): string {
  const protectedChunks: string[] = [];
  const stash = (chunk: string) => {
    protectedChunks.push(chunk);
    return `\u0000P${protectedChunks.length - 1}\u0000`;
  };

  let out = text;
  out = out.replace(/\*\*[^*\n]{1,120}\*\*/gu, stash);
  out = out.replace(/[«"][^»"\n]{1,80}[»"]/gu, stash);

  const replacements: Array<[RegExp, string]> = [
    [/(?<!\p{L})вашими(?!\p{L})/giu, "твоими"],
    [/(?<!\p{L})вашему(?!\p{L})/giu, "твоему"],
    [/(?<!\p{L})вашего(?!\p{L})/giu, "твоего"],
    [/(?<!\p{L})вашей(?!\p{L})/giu, "твоей"],
    [/(?<!\p{L})вашем(?!\p{L})/giu, "твоём"],
    [/(?<!\p{L})вашим(?!\p{L})/giu, "твоим"],
    [/(?<!\p{L})ваших(?!\p{L})/giu, "твоих"],
    [/(?<!\p{L})вашу(?!\p{L})/giu, "твою"],
    [/(?<!\p{L})ваши(?!\p{L})/giu, "твои"],
    [/(?<!\p{L})ваше(?!\p{L})/giu, "твоё"],
    [/(?<!\p{L})ваша(?!\p{L})/giu, "твоя"],
    [/(?<!\p{L})ваш(?!\p{L})/giu, "твой"],
    [/(?<!\p{L})вами(?!\p{L})/giu, "тобой"],
    [/(?<!\p{L})вам(?!\p{L})/giu, "тебе"],
    [/(?<!\p{L})вас(?!\p{L})/giu, "тебя"],
    [/(?<!\p{L})вы(?!\p{L})/giu, "ты"],
  ];

  for (const [re, to] of replacements) {
    out = out.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      if (match[0] === match[0].toLowerCase()) return to;
      // Title / mixed — keep lowercase target for Cyrillic possessives
      return to;
    });
  }

  out = out.replace(/\u0000P(\d+)\u0000/g, (_, idx) => protectedChunks[Number(idx)] ?? "");
  return out;
}

/** Ensure blank lines before card bold-heads and ## sections. */
export function ensureReadingParagraphBreaks(text: string): string {
  let out = text.replace(/\r\n/g, "\n").trim();
  if (!out) return out;

  out = out.replace(/([^\n])\n(##\s)/g, "$1\n\n$2");
  out = out.replace(/([^\n])\n(\*\*[^*\n]{2,80}\*\*)/g, "$1\n\n$2");
  // Card name mid-paragraph after sentence end: ". **Луна**"
  out = out.replace(/([.!?…»"])\s+(\*\*[^*\n]{2,80}\*\*)/gu, "$1\n\n$2");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** Lift the last paragraphs into a required ## Простыми словами block (AI prose, reformatted). */
export function ensureSimplyWordsSection(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || hasSimplyWordsSection(trimmed)) return trimmed;

  const paras = trimmed.split(/\n{2,}/u).map((p) => p.trim()).filter(Boolean);
  if (paras.length >= 2) {
    const last = paras.pop()!;
    if (/^#{1,3}\s/u.test(last)) {
      return [...paras, last.replace(/^#{1,3}\s*/u, "## Простыми словами\n\n")].join("\n\n");
    }
    return [...paras, "## Простыми словами", last].join("\n\n");
  }

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+(?:\s|$)/gu) ?? [];
  if (sentences.length >= 4) {
    const body = sentences.slice(0, -3).join("").trim();
    const tail = sentences.slice(-3).join("").trim();
    if (body && tail) return `${body}\n\n## Простыми словами\n\n${tail}`;
  }

  return `${trimmed}\n\n## Простыми словами\n\n${trimmed.slice(-420).trim()}`;
}

/** Strip scaffold openings, normalize address/paragraphs, ensure tarot finale. */
export function normalizePaidReadingStructure(
  text: string,
  characterId?: string | null
): string {
  let out = text.trim();
  if (!out) return out;

  out = out.replace(/^\*{0,2}\s*Расклад\s+для[^\n]*\n+/iu, "").trim();
  if (/^#{2,3}\s+(?!Простыми словами)/iu.test(out)) {
    out = out.replace(/^#{2,3}\s+[^\n]+\n+/u, "").trim();
  }

  if (masterUsesTy(characterId)) {
    out = normalizeClientTyAddress(out);
  }

  out = ensureReadingParagraphBreaks(out);

  if (isTarotRuneMasterId(characterId ?? "")) {
    out = ensureSimplyWordsSection(out);
    out = ensureReadingParagraphBreaks(out);
  }
  return out;
}

/** Collect all premium defects (blocking + soft). */
export function listPaidReadingQualityIssues(
  text: string,
  opts: {
    cardCount: number;
    characterId?: string | null;
  }
): ReadingQualityIssue[] {
  const trimmed = text.trim();
  if (!trimmed) return ["too_short"];

  const words = countWords(trimmed);
  const issues: ReadingQualityIssue[] = [];
  if (words < softMinWordsForSpread(opts.cardCount)) issues.push("too_short");
  if (!hasVerdictSignal(trimmed)) issues.push("no_verdict");
  if (isTarotRuneMasterId(opts.characterId ?? "") && !hasSimplyWordsSection(trimmed)) {
    issues.push("missing_simply_words");
  }
  if (masterUsesTy(opts.characterId) && mixesTuVyAddress(trimmed)) {
    issues.push("mixed_address");
  }
  if (hardFillerHits(trimmed).length) issues.push("hard_filler");
  if (opensWithTitleScaffold(trimmed)) issues.push("title_opening");
  return issues;
}

/**
 * Premium gate for paid spreads.
 * `ok:false` for blocking defects — thin text below hard floor counts as blocking too_short.
 */
export function evaluatePaidReadingQuality(
  text: string,
  opts: {
    cardCount: number;
    characterId?: string | null;
  }
): ReadingQualityResult {
  const issues = listPaidReadingQualityIssues(text, opts);
  const words = countWords(text.trim());
  const hardThin = words < hardMinWordsForSpread(opts.cardCount);

  const blocking = issues.filter((i) => {
    if (i === "too_short") return hardThin;
    return (BLOCKING_QUALITY_ISSUES as readonly string[]).includes(i);
  });

  if (!blocking.length) {
    return { ok: true, issues };
  }
  return { ok: false, issues, detail: blocking.join("|") };
}

/** Human-readable repair instructions for the model. */
export function buildQualityRepairHint(issues: ReadingQualityIssue[]): string {
  const lines: string[] = [];
  if (issues.includes("too_short")) {
    lines.push(
      "Сделай текст плотнее и длиннее: на каждый символ — имя, смысл здесь, вывод по вопросу (не меньше 4 предложений на позицию), без воды."
    );
  }
  if (issues.includes("no_verdict")) {
    lines.push(
      "Первая фраза — вердикт (жёстко / в плюс / смешанно / стоит / не стоит) по вопросу клиента. Не начинай с описания процесса."
    );
  }
  if (issues.includes("missing_simply_words")) {
    lines.push("В конце обязателен блок ровно с заголовком «## Простыми словами» (5–7 предложений).");
  }
  if (issues.includes("mixed_address")) {
    lines.push(
      "К клиенту только на «ты» (ты/тебе/твой/твоя). Запрещены «вы/вам/вас/ваш/ваша/ваши» в обращении к клиенту."
    );
  }
  if (issues.includes("hard_filler")) {
    lines.push(
      "Убери канцелярит и эзотерическую воду: «в контексте», «энергетический», «вибрации», «всё будет хорошо»."
    );
  }
  if (issues.includes("title_opening")) {
    lines.push("Не начинай с заголовка «Расклад для…» и не ставь ### в первой строке.");
  }
  lines.push("Субъект вопроса бери только из формулировки клиента — не подменяй мужа братом и т.п.");
  lines.push("Абзацы разделяй пустой строкой: вердикт, затем каждый символ, затем «## Простыми словами».");
  return lines.join(" ");
}
