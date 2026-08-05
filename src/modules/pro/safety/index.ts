/** Crisis + output safety for Pro dialogs and drafts. */

const CRISIS_NEEDLES = [
  "суицид",
  "убить себя",
  "покончить с собой",
  "не хочу жить",
  "самоубий",
  "перерезать вены",
  "прыгну с",
  "наглотаюсь таблеток",
];

const MEDICAL_NEEDLES = [
  "диагноз",
  "назначьте лечение",
  "вылечить рак",
  "гарантированно выздорове",
  "медицинский совет",
  "медицинское совет",
];

const GUARANTEE_NEEDLES = [
  "гарантирую",
  "100% сбудется",
  "точно случится",
  "обязательно вернётся",
  "обязательно вернется",
  "предсказываю наверняка",
];

function containsAny(text: string, needles: string[]): string | null {
  const lower = text.toLowerCase();
  for (const n of needles) {
    if (lower.includes(n.toLowerCase())) return n;
  }
  return null;
}

export function detectCrisis(text: string): { crisis: boolean; reasons: string[] } {
  if (!text?.trim()) return { crisis: false, reasons: [] };
  const hit = containsAny(text, CRISIS_NEEDLES);
  if (hit) return { crisis: true, reasons: ["crisis_keyword", hit] };
  return { crisis: false, reasons: [] };
}

export function filterPractitionerOutput(text: string): {
  ok: boolean;
  text: string;
  blocked: string[];
} {
  const blocked: string[] = [];
  let out = text;
  if (containsAny(out, MEDICAL_NEEDLES)) {
    blocked.push("medical_claim");
    out = `${out}\n\n[редакция: сняты медицинские формулировки]`;
  }
  if (containsAny(out, GUARANTEE_NEEDLES)) {
    blocked.push("guarantee_claim");
    out = out.replace(/гарантирую/gi, "[без гарантий]");
  }
  return { ok: blocked.length === 0, text: out, blocked };
}

export const PRO_PUBLIC_DISCLAIMER =
  "Развлекательно-ознакомительный сервис 18+. Не заменяет медицинскую, юридическую или иную профессиональную помощь.";
