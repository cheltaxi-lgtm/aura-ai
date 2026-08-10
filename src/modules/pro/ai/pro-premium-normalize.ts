/**
 * Shared Pro premium bar for all client-facing report blocks.
 * Applied after matrix/hd/natal/manual generation — never mutates consumer cabinet paths.
 */

import type { ProReportBlock, ProReportSectionKind } from "../domain/types";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "./report-plain";

/**
 * HD sectional often ends with «Что делать:» (same sentence or new line) /
 * typo «Чрактика:»; matrix zones use «Практика:».
 * Match the last marker so earlier mentions of «практика» stay in prose.
 */
const PRACTICE_MARKER_RE =
  /(?:^|\n|[.!?…;:—–-]\s*)(?:Практика|Чрактика|Что\s+делать)\s*[:.]?\s+/giu;
const ARCANA_IN_TITLE_RE =
  /\(\s*(\d{1,2})\s*[—–-]\s*([^)]+?)\s*\)\s*$/u;

export type NormalizeProPremiumOpts = {
  clientAlias: string;
  focus?: string | null;
  caseType?: string | null;
};

/**
 * Convert client-facing «ты» forms to «Вы» for Pro delivery.
 * Protects quoted labels and short bold spans.
 */
export function normalizeClientVyAddress(text: string): string {
  const protectedChunks: string[] = [];
  const stash = (chunk: string) => {
    protectedChunks.push(chunk);
    return `\u0000P${protectedChunks.length - 1}\u0000`;
  };

  let out = String(text || "");
  out = out.replace(/\*\*[^*\n]{1,120}\*\*/gu, stash);
  out = out.replace(/[«"][^»"\n]{1,80}[»"]/gu, stash);

  const replacements: Array<[RegExp, string]> = [
    [/(?<!\p{L})твоими(?!\p{L})/giu, "вашими"],
    [/(?<!\p{L})твоему(?!\p{L})/giu, "вашему"],
    [/(?<!\p{L})твоего(?!\p{L})/giu, "вашего"],
    [/(?<!\p{L})твоей(?!\p{L})/giu, "вашей"],
    [/(?<!\p{L})твоём(?!\p{L})/giu, "вашем"],
    [/(?<!\p{L})твоем(?!\p{L})/giu, "вашем"],
    [/(?<!\p{L})твоим(?!\p{L})/giu, "вашим"],
    [/(?<!\p{L})твоих(?!\p{L})/giu, "ваших"],
    [/(?<!\p{L})твою(?!\p{L})/giu, "вашу"],
    [/(?<!\p{L})твои(?!\p{L})/giu, "ваши"],
    [/(?<!\p{L})твоё(?!\p{L})/giu, "ваше"],
    [/(?<!\p{L})твое(?!\p{L})/giu, "ваше"],
    [/(?<!\p{L})твоя(?!\p{L})/giu, "ваша"],
    [/(?<!\p{L})твой(?!\p{L})/giu, "ваш"],
    [/(?<!\p{L})тобой(?!\p{L})/giu, "вами"],
    [/(?<!\p{L})тебе(?!\p{L})/giu, "вам"],
    [/(?<!\p{L})тебя(?!\p{L})/giu, "вас"],
    [/(?<!\p{L})ты(?!\p{L})/giu, "вы"],
  ];

  for (const [re, to] of replacements) {
    out = out.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  out = out.replace(/\u0000P(\d+)\u0000/g, (_, idx) => protectedChunks[Number(idx)] ?? "");
  return repairVyVerbAgreement(out);
}

/**
 * After ты→Вы pronoun swap, fix leftover 2sg verb forms («вы чувствуешь» → «вы чувствуете»).
 * Also lifts common 2sg imperatives used in practice callouts.
 */
export function repairVyVerbAgreement(text: string): string {
  let out = String(text || "");

  // Reflexive present/future before plain -ешь/-ишь.
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ешься(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}етесь`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ёшься(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ётесь`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ишься(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}итесь`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ешь(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ете`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ёшь(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ёте`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ишь(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ите`
  );

  // Past tense agreement: вы получила / стал / могло → получили / стали / могли.
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)лась(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}лись`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)лось(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}лись`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ла(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ли`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?)ло(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ли`
  );
  out = out.replace(
    /(?<!\p{L})([Вв]ы)\s+(\p{L}+?[аеёиоуыэюя])л(?!\p{L})/gu,
    (_, p, stem) => `${p} ${stem}ли`
  );

  // Frequent short adjectives after Вы.
  const shortAdj: Array<[RegExp, string]> = [
    [/(?<!\p{L})([Вв]ы)\s+чувствительна(?!\p{L})/gu, "$1 чувствительны"],
    [/(?<!\p{L})([Вв]ы)\s+осторожна(?!\p{L})/gu, "$1 осторожны"],
    [/(?<!\p{L})([Вв]ы)\s+внимательна(?!\p{L})/gu, "$1 внимательны"],
    [/(?<!\p{L})([Вв]ы)\s+готова(?!\p{L})/gu, "$1 готовы"],
    [/(?<!\p{L})([Вв]ы)\s+способна(?!\p{L})/gu, "$1 способны"],
  ];
  for (const [re, to] of shortAdj) out = out.replace(re, to);

  // Bare 2sg present forms left after pronoun rewrite («чем можешь» → «чем можете»).
  const barePresent: Array<[RegExp, string]> = [
    [/(?<!\p{L})можешь(?!\p{L})/giu, "можете"],
    [/(?<!\p{L})умеешь(?!\p{L})/giu, "умеете"],
    [/(?<!\p{L})хочешь(?!\p{L})/giu, "хотите"],
    [/(?<!\p{L})видишь(?!\p{L})/giu, "видите"],
    [/(?<!\p{L})знаешь(?!\p{L})/giu, "знаете"],
    [/(?<!\p{L})делаешь(?!\p{L})/giu, "делаете"],
    [/(?<!\p{L})идёшь(?!\p{L})/giu, "идёте"],
    [/(?<!\p{L})идешь(?!\p{L})/giu, "идете"],
    [/(?<!\p{L})станешь(?!\p{L})/giu, "станете"],
    [/(?<!\p{L})будешь(?!\p{L})/giu, "будете"],
    [/(?<!\p{L})чувствуешь(?!\p{L})/giu, "чувствуете"],
    [/(?<!\p{L})прячешься(?!\p{L})/giu, "прячетесь"],
    [/(?<!\p{L})уходишь(?!\p{L})/giu, "уходите"],
    [/(?<!\p{L})становишься(?!\p{L})/giu, "становитесь"],
    [/(?<!\p{L})рискуешь(?!\p{L})/giu, "рискуете"],
    [/(?<!\p{L})заглушаешь(?!\p{L})/giu, "заглушаете"],
    [/(?<!\p{L})проявляешь(?!\p{L})/giu, "проявляете"],
    [/(?<!\p{L})подавляешь(?!\p{L})/giu, "подавляете"],
    [/(?<!\p{L})действуешь(?!\p{L})/giu, "действуете"],
    [/(?<!\p{L})вдохновляешься(?!\p{L})/giu, "вдохновляетесь"],
    [/(?<!\p{L})застреваешь(?!\p{L})/giu, "застреваете"],
    [/(?<!\p{L})решаешь(?!\p{L})/giu, "решаете"],
    [/(?<!\p{L})замечаешь(?!\p{L})/giu, "замечаете"],
  ];
  for (const [re, to] of barePresent) {
    out = out.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  // Common 2sg imperatives in practices / steps (preserve quoted questions).
  const imperatives: Array<[RegExp, string]> = [
    [/(?<!\p{L})записывай(?!\p{L})/giu, "записывайте"],
    [/(?<!\p{L})учись(?!\p{L})/giu, "учитесь"],
    [/(?<!\p{L})выбери(?!\p{L})/giu, "выберите"],
    [/(?<!\p{L})укрепляй(?!\p{L})/giu, "укрепляйте"],
    [/(?<!\p{L})сделай(?!\p{L})/giu, "сделайте"],
    [/(?<!\p{L})оформи(?!\p{L})/giu, "оформите"],
    [/(?<!\p{L})проведи(?!\p{L})/giu, "проведите"],
    [/(?<!\p{L})проанализируй(?!\p{L})/giu, "проанализируйте"],
    [/(?<!\p{L})отпусти(?!\p{L})/giu, "отпустите"],
    [/(?<!\p{L})разорви(?!\p{L})/giu, "разорвите"],
    [/(?<!\p{L})проговаривай(?!\p{L})/giu, "проговаривайте"],
    [/(?<!\p{L})сформулируй(?!\p{L})/giu, "сформулируйте"],
    [/(?<!\p{L})поставь(?!\p{L})/giu, "поставьте"],
    [/(?<!\p{L})работай(?!\p{L})/giu, "работайте"],
    [/(?<!\p{L})создай(?!\p{L})/giu, "создайте"],
    [/(?<!\p{L})анализируй(?!\p{L})/giu, "анализируйте"],
    [/(?<!\p{L})отслеживай(?!\p{L})/giu, "отслеживайте"],
    [/(?<!\p{L})избегай(?!\p{L})/giu, "избегайте"],
    [/(?<!\p{L})удели(?!\p{L})/giu, "уделите"],
    [/(?<!\p{L})подводи(?!\p{L})/giu, "подводите"],
    [/(?<!\p{L})замечай(?!\p{L})/giu, "замечайте"],
    [/(?<!\p{L})практикуй(?!\p{L})/giu, "практикуйте"],
    [/(?<!\p{L})доверяй(?!\p{L})/giu, "доверяйте"],
    [/(?<!\p{L})спроси(?!\p{L})/giu, "спросите"],
    [/(?<!\p{L})превращай(?!\p{L})/giu, "превращайте"],
    [/(?<!\p{L})следи(?!\p{L})/giu, "следите"],
    [/(?<!\p{L})установи(?!\p{L})/giu, "установите"],
    [/(?<!\p{L})отметь(?!\p{L})/giu, "отметьте"],
    [/(?<!\p{L})включи(?!\p{L})/giu, "включите"],
    [/(?<!\p{L})примени(?!\p{L})/giu, "примените"],
    [/(?<!\p{L})выпиши(?!\p{L})/giu, "выпишите"],
    [/(?<!\p{L})будь(?!\p{L})/giu, "будьте"],
    [/(?<!\p{L})делай(?!\p{L})/giu, "делайте"],
  ];
  for (const [re, to] of imperatives) {
    out = out.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return to.charAt(0).toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  return out;
}

/** Collapse «Ксения, ксения,» — JS case-insensitive backrefs break on Cyrillic. */
export function collapseDuplicateNameOpeners(
  text: string,
  alias?: string | null
): string {
  let out = String(text || "");
  out = out.replace(/(\p{L}{2,40}),\s+(\p{L}{2,40}),/gu, (full, a, b) =>
    String(a).toLowerCase() === String(b).toLowerCase() ? `${a},` : full
  );
  const name = alias?.trim();
  if (name) {
    const esc = escapeRegExp(name);
    out = out.replace(
      new RegExp(`(?:${esc}\\s*,\\s*){2,}`, "giu"),
      `${name}, `
    );
  }
  return out;
}

function ensureSingleNameOpener(
  body: string,
  alias: string,
  kind: ProReportSectionKind
): string {
  const name = alias.trim();
  if (!name || !body) return body;
  if (kind === "focus" || kind === "steps") {
    return collapseDuplicateNameOpeners(body, name);
  }

  const esc = escapeRegExp(name);
  let rest = body.replace(new RegExp(`^(?:${esc}\\s*,\\s*)+`, "iu"), "").trim();
  rest = collapseDuplicateNameOpeners(rest, name).trim();
  if (!rest) return `${name}.`;

  if (/^вы\b/iu.test(rest)) {
    rest = `Вы${rest.slice(rest.match(/^вы/iu)![0].length)}`;
    return `${name}, ${rest}`;
  }

  if (/^\d/.test(rest)) {
    return collapseDuplicateNameOpeners(`${name}, ${rest}`, name);
  }

  const restBody = rest.charAt(0).toLocaleLowerCase("ru-RU") + rest.slice(1);
  return `${name}, ${restBody}`;
}

export function extractPracticeFromBody(body: string): {
  prose: string;
  practice: string | null;
} {
  const text = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { prose: "", practice: null };

  PRACTICE_MARKER_RE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = PRACTICE_MARKER_RE.exec(text)) !== null) last = m;
  if (!last) return { prose: text, practice: null };

  const marker = last[0];
  const markerAt = last.index;
  // Keep sentence punctuation on the prose side («. Что делать», «! Что делать»).
  const proseEnd = /^[.!?…;:—–-]/.test(marker) ? markerAt + 1 : markerAt;
  const prose = text.slice(0, proseEnd).trim();
  const practice = text
    .slice(markerAt + marker.length)
    .replace(/\s+/g, " ")
    .trim();
  if (!practice) return { prose: text, practice: null };
  return { prose, practice };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFocusRefrainSentence(sentence: string, focus?: string | null): boolean {
  const s = sentence.trim();
  if (!s || s.length < 12) return false;
  const lower = s.toLowerCase();
  if (
    /запрос/.test(lower) &&
    /(деньг|отношен|интересу)/.test(lower)
  ) {
    return true;
  }
  if (/исследу(е|ё|ешь|ете|ют)?\s+деньги\s+и\s+отношения/i.test(s)) {
    return true;
  }
  if (/пришл[аи]\s+с\s+запросом/i.test(s)) {
    return true;
  }
  const focusTrim = focus?.trim();
  if (focusTrim && focusTrim.length >= 8) {
    const focusLower = focusTrim.toLowerCase();
    if (lower.includes(focusLower) && /запрос|интересу|исследу/.test(lower)) {
      return true;
    }
  }
  return false;
}

/** Remove mechanical «ваш запрос про …» refrain from zone bodies. */
export function stripFocusRefrain(text: string, focus?: string | null): string {
  let out = String(text || "").replace(/\r\n/g, "\n");
  if (!out.trim()) return out;

  // Drop whole sentences that are mechanical focus openers (length-agnostic).
  const parts = out.split(/(?<=[.!?…])\s+/u);
  out = parts
    .filter((sentence, idx) => {
      // Always allow later substantive sentences; strip refrain openers anywhere.
      if (isFocusRefrainSentence(sentence, focus)) return false;
      // Also drop a leading clause before first period if it is only a refrain.
      if (idx === 0 && isFocusRefrainSentence(`${sentence}.`, focus)) return false;
      return true;
    })
    .join(" ")
    .trim();

  // Safety net: cut a leading refrain clause before the first period.
  out = out.replace(
    /^[^.!?\n]{0,80}запрос[^.!?\n]{0,160}(деньг|отношен|интересу)[^.!?\n]{0,200}[.!?…]+\s*/iu,
    ""
  );
  out = out.replace(
    /^[^.!?\n]{0,80}исследу\p{L}*\s+деньги\s+и\s+отношения[^.!?\n]{0,200}[.!?…]+\s*/iu,
    ""
  );

  const focusTrim = focus?.trim();
  if (focusTrim && focusTrim.length >= 8) {
    const esc = escapeRegExp(focusTrim);
    out = out.replace(
      new RegExp(
        `^[^.!?\\n]{0,60}«?${esc}»?[^.!?\\n]{0,200}[.!?…]+\\s*`,
        "iu"
      ),
      ""
    );
  }

  out = collapseDuplicateNameOpeners(out);
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/ {2,}/g, " ");
  // Capitalize after cleanup if we start mid-sentence.
  if (out && /^\p{Ll}/u.test(out)) {
    out = out.charAt(0).toLocaleUpperCase("ru-RU") + out.slice(1);
  }
  return out.trim();
}

function inferSectionKind(
  block: ProReportBlock,
  caseType?: string | null
): ProReportSectionKind {
  if (block.sectionKind) return block.sectionKind;
  const id = String(block.id || "").toLowerCase();
  const title = String(block.title || "").toLowerCase();
  if (id === "focus-answer" || id === "q0" || /ответ на ваш запрос|^запрос$/.test(title)) {
    return "focus";
  }
  if (id.includes("intro") || /^вступление/.test(title)) return "intro";
  if (id.includes("finale") || /простыми словами/.test(title)) return "finale";
  if (id.includes("steps") || /шаги на 30|практик/.test(title)) {
    return /практик/.test(title) && caseType === "hd" ? "zone" : "steps";
  }
  if (id.startsWith("matrix-zone-") || id.startsWith("n-") || id.startsWith("h-")) {
    return "zone";
  }
  if (caseType === "manual_spread") return "zone";
  return "generic";
}

function splitTitleEyebrow(block: ProReportBlock): {
  title: string;
  eyebrow: string | null;
} {
  let title = polishProReportTitle(block.title || "");
  let eyebrow =
    typeof block.eyebrow === "string" && block.eyebrow.trim()
      ? polishProReportTitle(block.eyebrow)
      : null;
  if (!eyebrow) {
    const m = title.match(ARCANA_IN_TITLE_RE);
    if (m) {
      eyebrow = `${m[1]} — ${m[2].trim()}`;
      title = title.replace(ARCANA_IN_TITLE_RE, "").trim();
    }
  }
  return { title, eyebrow };
}

function buildFocusBody(
  clientAlias: string,
  focus: string,
  blocks: ProReportBlock[]
): string {
  const name = clientAlias.trim() || "клиент";
  const money = blocks.find(
    (b) =>
      /^деньг/i.test(b.title || "") ||
      String(b.id || "").includes("money")
  );
  const love = blocks.find(
    (b) =>
      /^отношен/i.test(b.title || "") ||
      String(b.id || "").includes("love")
  );
  const pull = (b?: ProReportBlock) => {
    if (!b?.body) return null;
    const sentence = polishProReportPlainText(b.body)
      .split(/(?<=[.!?…])\s+/u)
      .map((s) => s.trim())
      .find((s) => s.length > 40 && s.length < 220);
    return sentence || null;
  };

  const parts = [
    `${name}, Вы пришли с запросом «${focus}». Ниже — как карта отвечает на него конкретно, без общих фраз.`,
    "",
  ];
  const m = pull(money);
  const l = pull(love);
  if (m) {
    parts.push(`По деньгам: ${m}`);
    parts.push("");
  }
  if (l) {
    parts.push(`По отношениям: ${l}`);
    parts.push("");
  }
  if (!m && !l) {
    parts.push(
      "Сначала прочитайте разделы, прямо связанные с запросом, — это главный ответ. Остальные зоны показывают опору, риски и что усиливает или мешает именно здесь."
    );
    parts.push("");
  }
  parts.push(
    "Не ищите в отчёте сроков и «да/нет». Берите механику: что помогает, что мешает, какой один шаг сделать на этой неделе."
  );
  return parts.join("\n").trim();
}

function ensureFocusBlock(
  blocks: ProReportBlock[],
  opts: NormalizeProPremiumOpts
): ProReportBlock[] {
  const focus = opts.focus?.trim();
  if (!focus) return blocks;

  const idx = blocks.findIndex(
    (b) =>
      b.sectionKind === "focus" ||
      b.id === "focus-answer" ||
      b.id === "q0" ||
      /^запрос$|^ответ на ваш запрос$/i.test(b.title || "")
  );

  const substantial =
    idx >= 0 &&
    polishProReportPlainText(blocks[idx]!.body || "").length >= 220 &&
    !/^«?.{0,80}»?$/.test(polishProReportPlainText(blocks[idx]!.body || "").trim()) &&
    polishProReportPlainText(blocks[idx]!.body || "").trim() !== focus;

  if (substantial) {
    const next = [...blocks];
    const cur = next[idx]!;
    next[idx] = {
      ...cur,
      id: cur.id === "q0" ? "focus-answer" : cur.id,
      title: "Ответ на ваш запрос",
      sectionKind: "focus",
      ai_confidence: Math.max(cur.ai_confidence ?? 0.9, 0.9),
    };
    if (idx > 0) {
      const [focusBlock] = next.splice(idx, 1);
      return [focusBlock!, ...next];
    }
    return next;
  }

  const focusBlock: ProReportBlock = {
    id: "focus-answer",
    title: "Ответ на ваш запрос",
    body: buildFocusBody(opts.clientAlias, focus, blocks),
    sectionKind: "focus",
    ai_confidence: 0.95,
    practice: null,
    eyebrow: null,
  };

  if (idx >= 0) {
    const next = [...blocks];
    next[idx] = focusBlock;
    if (idx > 0) {
      next.splice(idx, 1);
      return [focusBlock, ...next];
    }
    return next;
  }
  return [focusBlock, ...blocks];
}

/**
 * Canonical Pro premium post-pass for any case type.
 */
export function normalizeProPremiumBlocks(
  blocks: ProReportBlock[],
  opts: NormalizeProPremiumOpts
): ProReportBlock[] {
  const focus = opts.focus?.trim() || null;
  const alias = opts.clientAlias.trim() || "клиент";

  let next: ProReportBlock[] = (blocks || []).map((raw, i) => {
    const kind = inferSectionKind(raw, opts.caseType);
    const { title, eyebrow } = splitTitleEyebrow(raw);
    let body = polishProReportPlainText(raw.body || "");
    let practice =
      typeof raw.practice === "string" && raw.practice.trim()
        ? polishProReportPlainText(raw.practice)
        : null;
    if (!practice) {
      const split = extractPracticeFromBody(body);
      body = split.prose;
      practice = split.practice ? polishProReportPlainText(split.practice) : null;
    }

    // HD practice sections: whole body is the practice callout.
    if (!practice && /практик/i.test(title) && body.length > 40 && body.length < 900) {
      practice = body;
    }

    if (kind !== "focus") {
      body = stripFocusRefrain(body, focus);
      if (practice) practice = stripFocusRefrain(practice, focus);
    }

    body = normalizeClientVyAddress(body);
    if (practice) practice = normalizeClientVyAddress(practice);

    body = ensureSingleNameOpener(body, alias, kind);
    body = collapseDuplicateNameOpeners(body, alias);
    if (practice) {
      practice = collapseDuplicateNameOpeners(practice, alias);
      practice = repairVyVerbAgreement(practice);
    }

    return {
      ...raw,
      id: raw.id || `b${i + 1}`,
      title,
      eyebrow,
      body,
      practice: practice || null,
      sectionKind: kind,
      arcanaNumber: raw.arcanaNumber ?? null,
      ai_confidence: raw.ai_confidence ?? 0.75,
    };
  });

  next = ensureFocusBlock(next, { ...opts, focus, clientAlias: alias });

  // Drop empty bodies (except focus with practice).
  next = next.filter((b) => {
    const hasBody = Boolean(polishProReportPlainText(b.body || "").trim());
    const hasPractice = Boolean(b.practice?.trim());
    return hasBody || hasPractice;
  });

  // Dedupe accidental repeated block ids (full report paste / double-write).
  const seen = new Set<string>();
  next = next.filter((b) => {
    const id = b.id || "";
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return next;
}

/** Test helper: count mechanical focus refrains in a report. */
export function countFocusRefrains(blocks: ProReportBlock[], focus?: string | null): number {
  let n = 0;
  for (const b of blocks) {
    if (b.sectionKind === "focus") continue;
    const text = `${b.body || ""}\n${b.practice || ""}`;
    const hits = text.match(/запрос[^\n.]{0,80}(деньг|отношен|интересу)/giu);
    n += hits?.length ?? 0;
    if (focus && focus.length >= 8) {
      const re = new RegExp(escapeRegExp(focus), "gi");
      const m = text.match(re);
      // allow at most 0 in zone bodies after normalize
      n += m?.length ?? 0;
    }
  }
  return n;
}
