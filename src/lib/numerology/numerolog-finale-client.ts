/** Client-safe helpers for numerolog finale text (no server/LLM imports). */

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const LLM_REFUSAL_RE = [
  /作为一个人工/i,
  /人工智能/i,
  /language model/i,
  /(?:I'm|I am) an AI/i,
  /还没学习/i,
  /cannot assist/i,
  /can't assist/i,
  /无法回答/i,
  /暂不(?:支持|提供)/i,
];

/** Reject empty, non-Russian, CJK or generic model-refusal outputs. */
export function isUnusableRussianLlmOutput(text: string, minCyrillic = 12): boolean {
  const t = text.trim();
  if (!t) return true;
  if (CJK_RE.test(t)) return true;
  if (LLM_REFUSAL_RE.some((re) => re.test(t))) return true;
  const cyrillic = (t.match(/[\u0400-\u04FF]/g) ?? []).length;
  return cyrillic < minCyrillic;
}

/** Remove trailing «Простыми словами» section so route can append it once. */
export function stripProstymiSlovamiSection(text: string): string {
  return text
    .replace(/\n{2,}(?:#{1,2}\s*)?(?:✦\s*)?Простыми словами[\s\S]*$/i, "")
    .trim();
}

/** Plain label — no ## so the chat renderer does not add ✦ headers. */
export const NUMEROLOG_FINALE_HEADER = "Простыми словами:";

const SECTION_GLITCH_RES: Array<[RegExp, string]> = [
  [/([а-яё]{1,5})(Совет чисел)/gi, ". $2"],
  [/([а-яё]{1,5})(Энергия периода)/gi, ". $2"],
  [/([а-яё]{1,5})(Число пути)/gi, ". $2"],
];

/** Strip markdown and fix common LLM glitches in numerolog replies. */
export function polishNumerologClientReply(text: string): string {
  let out = text.replace(/\r\n/g, "\n").trim();
  if (!out) return out;

  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*\n]+)\*/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/\*\*/g, "");

  out = out.replace(/клюСовет/gi, "Совет");
  for (const [re, repl] of SECTION_GLITCH_RES) {
    out = out.replace(re, repl);
  }

  out = out.replace(
    /(Совет чисел — \d+\.[\s\S]*?)(?=Совет чисел — \d+\.)/g,
    ""
  );

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function appendNumerologFinale(body: string, finale: string): string {
  const cleanBody = polishNumerologClientReply(stripProstymiSlovamiSection(body));
  if (!finale.trim()) return cleanBody;
  const cleanFinale = polishNumerologClientReply(finale);
  return `${cleanBody}\n\n${NUMEROLOG_FINALE_HEADER}\n\n${cleanFinale}`;
}
