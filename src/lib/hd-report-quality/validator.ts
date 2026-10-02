import {
  HD_CROSS_ANGLE_ALL,
  HD_ESCAPED_MD_PATTERNS,
  HD_FORBIDDEN_TOPIC_PATTERNS,
  HD_META_PHRASE_PATTERNS,
  HD_TECH_JUNK_PATTERNS,
  HD_TYPE_NAMES_RU,
} from "./dictionaries";
import type { HdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { HD_REPORT_REQUIRED_SECTIONS } from "@/lib/human-design/packages";
import { AUTHORITY_NAMES_RU, CENTER_NAMES_RU, CHANNELS, CROSS_NAMES_RU, DEFINITION_NAMES_RU, TYPE_META } from "@/lib/human-design/constants";

export type HdQualityRuleId =
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "V6"
  | "V7"
  | "V8"
  | "V9"
  | "V10"
  | "V11"
  | "V12";

export type HdQualityFinding = {
  rule: HdQualityRuleId;
  detail: string;
  /** Canonical titles containing the defect; used to repair only affected sections. */
  sectionTitles?: string[];
};

export type HdQualityResult = {
  ok: boolean;
  findings: HdQualityFinding[];
};

const MIN_REPORT_CHARS = 12_000;
const CENTER_MENTIONS: Record<string, RegExp> = {
  head: /теменн[\p{L}]*|голов[аыуе](?!\p{L})/iu,
  ajna: /аджн[\p{L}]*/iu,
  throat: /горлов[\p{L}]*|горл[аоуе](?!\p{L})/iu,
  g: /(?<!\p{L})(?:g|джи)(?:[\s-]*центр[\p{L}]*)?(?!\p{L})/iu,
  heart: /(?<!\p{L})эго(?!\p{L})|сердечн[\p{L}]*|центр[\p{L}]*\s+воли/iu,
  spleen: /селез[её]н[\p{L}]*/iu,
  sacral: /сакрал[\p{L}]*/iu,
  solar: /солнечн[\p{L}]*\s+сплетени[\p{L}]*|эмоциональн[\p{L}]*\s+центр[\p{L}]*/iu,
  root: /корнев[\p{L}]*|(?<!\p{L})кор(?:ень|ня|ню|нем)(?!\p{L})/iu,
};
const SHINGLE_OVERLAP_RATIO = 0.10;
const FOCUS_ANSWER_TITLE = "Ответ на ваш запрос";

function titleKey(title: string): string {
  return title.trim().replace(/[.!?…:]+$/u, "").trim().toLowerCase();
}

export function hdSectionMinimumChars(title: string): number {
  const key = titleKey(title);
  if (key === "вступление") return 200;
  if (key === "девять центров") return 1800;
  if (["тип и его особенности", "стратегия", "авторитет", "ложное «я»", "подпись"].includes(key)) return 400;
  return 600;
}

function plainText(text: string): string {
  return text.replace(/^#+\s*/gm, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

function splitSections(text: string): Array<{ title: string; body: string }> {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  const chunks = cleaned.split(/^##(?!#)\s+/m);
  const out: Array<{ title: string; body: string }> = [];
  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && !cleaned.startsWith("##")) {
      out.push({ title: "Вступление", body: trimmed });
      return;
    }
    const nl = trimmed.indexOf("\n");
    const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : trimmed.slice(nl + 1)).trim();
    if (title) out.push({ title, body });
  });
  return out;
}

function shingles(text: string, n = 8): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(" "));
  }
  return set;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

const MOTOR_COUNT_WORDS: Record<number, RegExp> = {
  1: /(?:одного|одним|один)\s+моторн/iu,
  2: /(?:двух|двумя|два)\s+моторн/iu,
  3: /(?:трёх|трех|тремя|три)\s+моторн/iu,
  4: /(?:четырёх|четырех|четырьмя|четыре)\s+моторн/iu,
};

/**
 * Contrast / negation window before a foreign-strategy or wrong-count hit.
 * Catches «не ждите приглашения», «в отличие от Проектора (ждать…)», «не два моторных».
 */
export function isHdQualityContrastContext(
  text: string,
  matchIndex: number
): boolean {
  // A comparison in a preceding sentence must not excuse later incorrect advice.
  const before = text.slice(Math.max(0, matchIndex - 160), matchIndex).split(/[.!?;\n]/u).at(-1) ?? "";
  // Avoid \\b — with Unicode it misses Cyrillic «Не ждите…».
  if (/(?:^|[^\p{L}])не\s+$/iu.test(before)) return true;
  if (
    /(?:не\s+нужно|не\s+надо|не\s+следует|нет\s+нужды|не\s+требуется)\s+$/iu.test(
      before
    )
  ) {
    return true;
  }
  if (
    /(?:в\s+отличие\s+от|в\s+отличии\s+от|вместо\s+(?:того\s+чтобы\s+)?|а\s+не\s+|без\s+того\s+чтобы\s+)/iu.test(
      before
    )
  ) {
    return true;
  }
  // Explanatory «стратегия Проектора — ждать…» — not reader advice.
  // Do NOT treat bare «как у Проектора: ждите…» as contrast (that is bad advice).
  if (
    /стратеги[яи]\s+(?:проектор|генератор|манифестор|манифестирующ\w*|рефлектор)\w*/iu.test(
      before
    )
  ) {
    return true;
  }
  return false;
}

/** True if pattern matches outside contrast/negation windows. */
export function regexHitsOutsideContrast(text: string, re: RegExp): boolean {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    if (!isHdQualityContrastContext(text, m.index)) return true;
  }
  return false;
}

/** Personal facts only ignore immediate negation, never a preceding comparison. */
function isPersonalFactNegated(text:string,index:number):boolean {
  const before=text.slice(Math.max(0,index-60),index);
  return /(?:^|[^\p{L}])(?:не|не нужно|не надо|не следует|не\s+(?:относит[\p{L}]*\s+к|явля[\p{L}]*|имеет))\s+$/iu.test(before);
}
function personalFactIgnored(text:string,index:number,match:string):boolean {
  const before=text.slice(Math.max(0,index-60),index);
  const explicit=/(?:^|[^\p{L}])(?:вы|ваш[\p{L}]*|у\s+вас)(?!\p{L})/iu.test(match)||/(?:ваш[\p{L}]*|у\s+вас)\s+(?:(?:внутренн|основн|личн)[\p{L}]*\s+)?$/iu.test(before);
  return explicit?isPersonalFactNegated(text,index):isHdQualityContrastContext(text,index);
}
function personalFactHits(text:string,re:RegExp):boolean {
  for(const m of text.matchAll(new RegExp(re.source,re.flags.includes("g")?re.flags:re.flags+"g"))) {
    if(!personalFactIgnored(text,m.index!,m[0]))return true;
  }
  return false;
}

function hdCrossAnglePattern(angle:string):string {
  if (/угол$/iu.test(angle)) return String.raw`${angle.split(" ")[0]!.slice(0,-2)}[\p{L}]*\s+уг(?:ол|л)[\p{L}]*`;
  if (angle.endsWith("ый")) return String.raw`${angle.slice(0,-2)}[\p{L}]*`;
  if (/джукстапозиция/iu.test(angle)) return String.raw`дж[ау]кстапозиц[\p{L}]*`;
  return angle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

/** Age constructions near HD mechanics (gates/channels/planets). */
const AGE_NEAR_MECHANICS =
  /(?:в\s+\d{1,2}\s+лет|\d{1,2}\s*[–-]\s*\d{1,2}\s+год)[^.!?\n]{0,80}(?:ворот|канал|солнц|лун|сатурн|юпитер|уран|нептун|плутон|меркур|венер|марс)/iu;

const PROFILE_PHASE_OK =
  /(?:до\s+30|после\s+50|30\s*[–-]\s*50)/iu;

export type HdValidateOpts = {
  engineTypeRu?: string | null;
  motorCount?: number | null;
  contract?: HdLockedContract | null;
  requireFocusAnswer?: boolean;
  scope?: "report" | "section";
  requiredSections?: readonly string[];
};

export function validateHdReportText(
  text: string,
  opts?: HdValidateOpts
): HdQualityResult {
  const findings: HdQualityFinding[] = [];
  // Inline emphasis cannot conceal a factual assertion from the checks.
  const rawBody = String(text || "");
  const body = rawBody.replace(/[*_`]/g, "");
  const contract = opts?.contract ?? null;
  const wholeReport = opts?.scope !== "section";

  for (const re of HD_META_PHRASE_PATTERNS) {
    if (re.test(body)) {
      findings.push({ rule: "V1", detail: `meta:${re.source}` });
      // V11 shares the expanded meta set — also tag V11 for new phrases
      if (
        /редакция|медицинские\s+формулировки|разбор\s+заверш|обязательные\s+разделы\s+раскрыты|продолжение\s+ниже/iu.test(
          re.source
        ) ||
        /\[редакция|сняты\s+медицинские|разбор\s+заверш|все\s+обязательные\s+разделы|продолжение\s+ниже/iu.test(
          body
        )
      ) {
        findings.push({ rule: "V11", detail: `meta_extended:${re.source}` });
      }
      break;
    }
  }
  // Explicit V11 sweep even if V1 already hit a different pattern
  if (!findings.some((f) => f.rule === "V11")) {
    const v11 = [
      /\[редакция\s*:/iu,
      /сняты\s+медицинские\s+формулировки/iu,
      /разбор\s+завершён/iu,
      /разбор\s+завершен/iu,
      /все\s+обязательные\s+разделы\s+раскрыты/iu,
      /продолжение\s+ниже/iu,
    ];
    for (const re of v11) {
      if (re.test(body)) {
        findings.push({ rule: "V11", detail: `meta_extended:${re.source}` });
        break;
      }
    }
  }

  const sections = splitSections(body);
  for (const s of sections) for (const sentence of s.body.matchAll(/[^.!?;\n]+/gu)) {
    const clause = sentence[0];
    for (const gate of clause.matchAll(/(?<!\p{L})канал\s+(\d{1,2})(?!\d)/giu)) {
      const tail = clause.slice(gate.index!+gate[0].length);
      const quotedNegation = /(?<!\p{L})не\s*[«“"]\s*$/iu.test(clause.slice(0,gate.index));
      if (!/^\s*(?:[–—/-]\s*\d{1,2}(?!\d)|и\s+\d{1,2}(?!\d))/iu.test(tail) && !quotedNegation && !isPersonalFactNegated(clause,gate.index!)) {
        findings.push({rule:"V4",detail:`single_gate_called_channel:${gate[1]}`,sectionTitles:[s.title]});
      }
    }
    if (!/канал[\p{L}]*/iu.test(clause)) continue;
    const connection = /соедин[еёяи][\p{L}]*|связыва[\p{L}]*|связа[\p{L}]*|между/iu.exec(clause);
    if (!connection || /(?:цепочк|опосредован|косвенн|промежуточн)/iu.test(clause) || isPersonalFactNegated(clause,connection.index) || /нельзя\s+(?:считать|назвать|называть)\s*$/iu.test(clause.slice(0,connection.index))) continue;
    const ids = [...clause.matchAll(/(?<!\d)(\d{1,2})\s*[–-]\s*(\d{1,2})(?!\d)/gu)];
    if (ids.length !== 1) continue;
    const id = ids[0]!;
    const ch = CHANNELS.find(c => c.gates.includes(Number(id[1])) && c.gates.includes(Number(id[2])));
    if (!ch) continue;
    const mentions = Object.entries(CENTER_MENTIONS).flatMap(([key,re]) => [...clause.matchAll(new RegExp(re.source,"giu"))].map(m => ({key,index:m.index!,end:m.index!+m[0].length}))).sort((a,b) => a.index-b.index);
    const before = mentions.filter(m => m.end <= connection.index);
    const after = mentions.filter(m => m.index >= connection.index+connection[0].length);
    const channelIsSubject = id.index! < connection.index && (!before.length || before.at(-1)!.end <= id.index!);
    const pair = (channelIsSubject || !before.length) ? after.slice(0,2)
      : after.length ? [before.at(-1)!,after[0]!] : before.slice(-2);
    if (pair.length === 2 && pair.some(c => !ch.centers.includes(c.key as typeof ch.centers[number]))) {
      findings.push({rule:"V4",detail:`wrong_channel_endpoints:${id[1]}-${id[2]}`,sectionTitles:[s.title]});
    }
  }
  const titleCounts = new Map<string, number>();
  for (const s of sections) {
    const key = titleKey(s.title);
    titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }
  for (const [title, n] of titleCounts) {
    if (n > 1) findings.push({ rule: "V2", detail: `duplicate_title:${title}×${n}`, sectionTitles: sections.filter(s => titleKey(s.title) === title).map(s => s.title) });
  }
  const shingleSets = sections.map((s) => shingles(`${s.title} ${s.body}`));
  for (let i = 0; i < shingleSets.length; i++) {
    for (let j = i + 1; j < shingleSets.length; j++) {
      const r = overlapRatio(shingleSets[i]!, shingleSets[j]!);
      if (r > SHINGLE_OVERLAP_RATIO) {
        findings.push({
          rule: "V2",
          detail: `shingle_overlap:${sections[i]!.title}↔${sections[j]!.title}:${r.toFixed(2)}`,
          sectionTitles: [sections[i]!.title, sections[j]!.title],
        });
      }
    }
  }

  for (const re of HD_FORBIDDEN_TOPIC_PATTERNS) {
    if (re.test(body)) {
      findings.push({ rule: "V3", detail: `forbidden:${re.source}` });
      break;
    }
  }

  const engineType = opts?.engineTypeRu?.trim() || contract?.typeRu;
  if (engineType) {
    const typeBody = sections.find(s => titleKey(s.title) === "тип и его особенности")?.body ?? body;
    if (wholeReport && !new RegExp(engineType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(typeBody)) {
      findings.push({ rule: "V4", detail: `missing_engine_type:${engineType}`, sectionTitles: ["Тип и его особенности"] });
    }
    for (const other of HD_TYPE_NAMES_RU) {
      if (other.toLowerCase() === engineType.toLowerCase()) continue;
      // Affirmative identity only: «Вы — Проектор». Skip «не Генератор» / «словно вы Генератор».
      const re = new RegExp(
        `(?<![\\p{L}])(?:вы|ваш\\s+тип|тип\\s+(?:карты|человека))\\s*(?:[—–-]|это|:)??\\s*${other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`,
        "iu"
      );
      if (personalFactHits(body, re)) {
        findings.push({ rule: "V4", detail: `wrong_type_asserted:${other}` });
      }
    }
  }

  const motorCount =
    opts?.motorCount ?? contract?.motorCentersDefinedRu.length ?? null;
  if (typeof motorCount === "number" && motorCount >= 0) {
    for (const [nStr, re] of Object.entries(MOTOR_COUNT_WORDS)) {
      const n = Number(nStr);
      if (n !== motorCount && regexHitsOutsideContrast(body, re)) {
        findings.push({
          rule: "V4",
          detail: `wrong_motor_count_claimed:${n}_vs_engine_${motorCount}`,
        });
      }
    }
  }

  for (const re of HD_TECH_JUNK_PATTERNS) {
    if (re.test(rawBody)) {
      findings.push({ rule: "V5", detail: `junk:${re.source}` });
      break;
    }
  }

  const emphasisText = rawBody.replace(/^\s*(?:\*\s*){3,}\s*$/gm, "").replace(/^\s*\*\s+/gm, "");
  if ((emphasisText.match(/(?<!\\)\*/g)?.length ?? 0) % 2 && /(?<!\\)\*\s*$/m.test(emphasisText)) {
    findings.push({ rule: "V5", detail: "junk:unmatched_emphasis" });
  }

  if (wholeReport && plainText(body).length < MIN_REPORT_CHARS) {
    findings.push({ rule: "V6", detail: `report_too_short:${plainText(body).length}` });
  }
  for (const s of sections) {
    const chars = plainText(s.body).length;
    if (s.title !== "Запрос" && chars < hdSectionMinimumChars(s.title)) {
      findings.push({
        rule: "V6",
        detail: `section_too_short:${s.title}:${chars}`,
        sectionTitles: [s.title],
      });
    }
    const words = plainText(s.body).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length >= 40 && (new Set(words).size < 20 || shingles(s.body).size / (words.length - 7) < 0.35)) {
      findings.push({ rule: "V2", detail: `repetitive_filler:${s.title}`, sectionTitles: [s.title] });
    }
  }
  if (wholeReport) {
    for (const title of opts?.requiredSections ?? ["Вступление",...HD_REPORT_REQUIRED_SECTIONS]) {
      if (!sections.some(s => titleKey(s.title) === titleKey(title))) {
        findings.push({ rule: "V6", detail: `missing_section:${title}`, sectionTitles: [title] });
      }
    }
  }
  const requireFocus = wholeReport && opts?.requireFocusAnswer !== false;
  if (requireFocus) {
    const hasAnswer = sections.some(
      (s) => s.title.trim().toLowerCase() === FOCUS_ANSWER_TITLE.toLowerCase()
    );
    if (!hasAnswer) {
      findings.push({ rule: "V6", detail: "missing_focus_answer_section", sectionTitles: [FOCUS_ANSWER_TITLE] });
    }
  }

  // V7 — cross angle / name
  if (contract) {
    const aliases = contract.crossAngleAliases.map((a) => a.toLowerCase());
    const hasOwnAngle = aliases.some((a) =>
      new RegExp(hdCrossAnglePattern(a),"iu").test(body)
    );
    if (wholeReport && !hasOwnAngle && /крест|угол/i.test(body)) {
      findings.push({
        rule: "V7",
        detail: `missing_cross_angle:${contract.crossAngleRu}`,
      });
    }
    for (const ang of HD_CROSS_ANGLE_ALL) {
      const isOwn = aliases.some((a) => a.toLowerCase() === ang.toLowerCase());
      if (isOwn) continue;
      const anglePattern = hdCrossAnglePattern(ang);
      const assertion = new RegExp(String.raw`(?:(?:ваш[\p{L}]*|у\s+вас)\s+(?:инкарнационн[\p{L}]*\s+)?(?:крест|угол)\s*(?:(?:[—–:]|это|является|имеет|относится\s+к)\s*)?(?:не\s+)?)?(?<!\p{L})(${anglePattern})`, "giu");
      const wrong = [...body.matchAll(assertion)].some(m => {
        const index = m.index! + m[0].length - m[1]!.length;
        const after = body.slice(index + m[1]!.length, index + m[1]!.length + 100);
        const before = body.slice(Math.max(0,index-100),index);
        const personal = /(?:^|[^\p{L}])(?:ваш[\p{L}]*|у\s+вас)(?!\p{L})/iu.test(m[0]);
        const other = /^\s*(?:(?:инкарнационн[\p{L}]*\s+)?(?:крест|угол)[\p{L}]*\s+)?(?:у\s+)?(?:друг|ин|чуж)[\p{L}]*\s+(?:человек|люд|партн)[\p{L}]*/iu.test(after)
          || /(?:друг|ин|чуж)[\p{L}]*\s+(?:человек|люд|партн)[\p{L}]*[^.!?;\n,]{0,35}$/iu.test(before);
        if (!personal && other) return false;
        return !isPersonalFactNegated(body,index) && !personalFactIgnored(body,m.index!,m[0]);
      });
      if (wrong) {
        findings.push({ rule: "V7", detail: `wrong_cross_angle:${ang}` });
      }
    }
  }

  // V8 — hanging gates consistency
  if (contract) {
    const hangSet = new Set(contract.hangingGateNumbers);
    const channelGateNums = new Set<number>();
    for (const key of contract.definedChannelKeys) {
      const m = /^(\d+)-(\d+)$/.exec(key);
      if (m) {
        channelGateNums.add(Number(m[1]));
        channelGateNums.add(Number(m[2]));
      }
    }
    for (const g of contract.crossGateNumbers) channelGateNums.add(g);

    // Mentions of "висяч" + gate number not in hang list
    const hangMentions = body.matchAll(
      /ви(?:сяч|сящ)[\p{L}]*[^.\n]{0,60}?ворот[аы]?\s*([\d\s,и–-]+)|ворот[аы]?\s*([\d\s,и–-]+)[^.\n]{0,40}ви(?:сяч|сящ)/giu
    );
    for (const m of hangMentions) {
      for (const value of (m[1] || m[2] || "").match(/\d{1,2}/g) ?? []) {
        const num = Number(value);
        if (!hangSet.has(num)) findings.push({ rule: "V8", detail: `false_hanging_gate:${num}` });
      }
    }
    // Claim hanging for a defined-channel gate
    for (const g of hangSet) {
      /* ok */
    }
    for (const g of channelGateNums) {
      if (
        !hangSet.has(g) &&
        new RegExp(`висяч\\w*[^.\\n]{0,40}ворот[аы]?\\s*${g}\\b`, "iu").test(body)
      ) {
        findings.push({ rule: "V8", detail: `channel_gate_called_hanging:${g}` });
      }
    }
  }

  // V9 — strategy vs type (ignore contrast/negation: «не ждите приглашения»)
  if (contract) {
    for (const re of contract.foreignStrategyPatterns) {
      if (regexHitsOutsideContrast(body, re)) {
        findings.push({ rule: "V9", detail: `foreign_strategy:${re.source}` });
        break;
      }
    }
  }

  // Validate explicit personal assertions against the saved chart. Comparisons
  // and negations are allowed, but do not excuse a later unrelated assertion.
  if (contract) {
    for (const s of sections) {
      const add = (detail: string, rule: HdQualityRuleId = "V4") => findings.push({ rule, detail, sectionTitles: [s.title] });
      if (!contract.profile.split("/").includes("6")) {
        const personalSix = /(?:у\s+вас\s+(?:(?:есть|присутствует)\s+)?|ваш[\p{L}]*\s+профил[\p{L}]*\s+(?:имеет|содержит|включает|есть)\s+)шест[\p{L}]*\s+лини[\p{L}]*|шест[\p{L}]*\s+лини[\p{L}]*\s+(?:ваш[\p{L}]*|условн[\p{L}]*|данн[\p{L}]*|этого)\s+профил[\p{L}]*/giu;
        if (personalFactHits(s.body,personalSix)) add("sixth_line_phase_without_sixth_profile","V10");
        if (/шест[\p{L}]*\s+лини[\p{L}]*/iu.test(s.body)) {
          for (const current of s.body.matchAll(/(?:сейчас|в\s+настоящее\s+время|на\s+данном\s+этапе)[^.!?\n]{0,180}/giu)) {
            const sixthPhase = /на\s+крыш[\p{L}]*|ролев[\p{L}]*\s+модел[\p{L}]*|30\s*[–-]\s*50|(?:до|после)\s+(?:30|50)/iu;
            const prior = s.body.slice(Math.max(0,current.index!-400),current.index);
            const refersToSixth = sixthPhase.test(current[0]) || (/(?:эт[\p{L}]*|данн[\p{L}]*)\s+диапазон[\p{L}]*/iu.test(current[0]) && sixthPhase.test(prior));
            if (refersToSixth && !/(?<!\p{L})не\s+(?:находит|входит|пребыв|явля|относ|в\s+фаз|на\s+крыш)/iu.test(current[0])) add("current_sixth_line_phase_without_sixth_profile","V10");
          }
        }
      }
      if (contract.profile.split("/").includes("6") && contract.ageYears != null) {
        const current = String.raw`(?:сейчас|в\s+настоящее\s+время|на\s+данном\s+этапе)[,\s]*(?:(?:вы\s+(?:находитесь|живёте|пребываете)|у\s+вас)\s+)?(?:в\s+)?(?:фаз[\p{L}]*|период[\p{L}]*)\s+`;
        if (contract.ageYears < 48 && new RegExp(current + String.raw`ролев[\p{L}]*\s+модел[\p{L}]*`,"iu").test(s.body)) add("false_current_profile_phase:after50","V10");
        if (contract.ageYears >= 52 && new RegExp(current + String.raw`(?:[«"]?на\s+крыш[\p{L}]*|30\s*[–-]\s*50)`,"iu").test(s.body)) add("false_current_profile_phase:roof","V10");
      }
      for(const [field,label,expected,values] of [
        ["signature","(?:ваш[\\p{L}]*\\s+)?подпись",contract.signatureRu,Object.values(TYPE_META).map(v=>v.signatureRu)],
        ["notSelf","(?:ваш[\\p{L}]*\\s+)?(?:ложн[\\p{L}]*\\s*[«\"]?я[»\"]?|не[—–-]я)",contract.notSelfRu,Object.values(TYPE_META).map(v=>v.notSelfRu)],
        ["definition","(?:ваш[\\p{L}]*\\s+)?определ[её]нность",contract.definitionRu,Object.values(DEFINITION_NAMES_RU)]
      ] as const) {
        for(const value of new Set(values)) {
          if(value.toLowerCase()===expected.toLowerCase())continue;
          const literal=value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
          if(personalFactHits(s.body,new RegExp(`${label}\\s*(?:[—–:]|это)\\s*[«\"]?${literal}(?!\\p{L})`,"giu")))add(`wrong_${field}:${value}`);
        }
      }
      for(const [label,key] of [["двойная","Раздвоённая определённость"],["тройная","Тройная раздвоённость"],["четверная","Четверная раздвоённость"]] as const) {
        if(contract.definitionRu!==key&&personalFactHits(s.body,new RegExp(`определ[её]нность\\s*[—–:]\\s*${label}(?!\\p{L})`,"giu")))add(`wrong_definition:${label}`);
      }
      for (const m of s.body.matchAll(/(?:ваш[\p{L}]*\s+профил[\p{L}]*|профил[\p{L}]*\s*(?:карты|человека)?\s*(?:[—–:]|это))\s*(?:(?:[—–:]|это|является|составляет|указан|равен)\s*)?(\d)\s*\/\s*(\d)/giu)) {
        if (`${m[1]}/${m[2]}` !== contract.profile && !isPersonalFactNegated(s.body, m.index!)) add(`wrong_profile:${m[1]}/${m[2]}`);
      }
      for (const [key, name] of Object.entries(AUTHORITY_NAMES_RU)) {
        if (key === contract.authorityKey) continue;
        const first = name.split(/[\s(]/)[0]!;
        const stem = first.length <= 3 ? first : first.slice(0, -2);
        const re = new RegExp(`(?:(?:ваш[\\p{L}]*\\s+)?авторитет[\\p{L}]*\\s*(?:[—–:]|это|является|указан|составляет)\\s*${stem}[\\p{L}]*|(?:у\\s+вас\\s+|ваш[\\p{L}]*\\s+)?${stem}[\\p{L}]*\\s+(?:внутренн[\\p{L}]*\\s+)?авторитет)`, "giu");
        if (personalFactHits(s.body, re)) add(`wrong_authority:${key}`);
      }
      for (const [key, name] of Object.entries(CENTER_NAMES_RU)) {
        const first = name.split(/[\s(]/)[0]!;
        const stem = first.length <= 3 ? first : first.slice(0, -2);
        const label = key === "solar" ? String.raw`солнечн[\p{L}]*(?:\s+сплетени[\p{L}]*)?` : String.raw`${stem}[\p{L}]*`;
        const subject = String.raw`(?:(?:ваш[\p{L}]*|у\s+вас)\s+(?:центр[\p{L}]*\s+)?)?${label}`;
        if (contract.definedCenterKeys.includes(key as typeof contract.definedCenterKeys[number])) {
          const opposite=new RegExp(String.raw`(?:открыт[\p{L}]*\s+(?:центр\s+)?${label}|${subject}(?:\s+центр)?\s+(?:(?:является|указан|считается)\s+)?(?:у\s+вас\s+)?(?:открыт[\p{L}]*|неопредел[её]н[\p{L}]*|не\s+определ[её]н[\p{L}]*))`,"giu");
          if(personalFactHits(s.body,opposite))add(`false_open_center:${key}`);
        } else {
          const re = new RegExp(String.raw`(?<![\p{L}])(?:определ[её]н[\p{L}]*\s+(?:центр\s+)?${label}|${subject}(?:\s+центр)?\s+(?:(?:является|указан|считается)\s+)?(?:у\s+вас\s+)?определ[её]н[\p{L}]*)`,"giu");
          if (personalFactHits(s.body, re)) add(`false_defined_center:${key}`);
        }
      }
      const planetStems:Record<string,string>={sun:"солнц[\\p{L}]*",earth:"земл[\\p{L}]*",moon:"лун[\\p{L}]*",northNode:"северн[\\p{L}]*\\s+(?:лунн[\\p{L}]*\\s+)?уз[её]л[\\p{L}]*",southNode:"южн[\\p{L}]*\\s+(?:лунн[\\p{L}]*\\s+)?уз[её]л[\\p{L}]*",mercury:"меркур[\\p{L}]*",venus:"венер[\\p{L}]*",mars:"марс[\\p{L}]*",jupiter:"юпитер[\\p{L}]*",saturn:"сатурн[\\p{L}]*",uranus:"уран[\\p{L}]*",neptune:"нептун[\\p{L}]*",pluto:"плутон[\\p{L}]*"};
      const prose=s.body.replace(/\*\*/g,"");
      for(const [side,sideStem] of [["personality","личност[\\p{L}]*"],["design","дизайн[\\p{L}]*"]] as const) {
        for(const activation of contract.activations[side]) {
          const planet=planetStems[activation.body];
          const re=new RegExp(`(?<!\\p{L})(?:${planet}\\s+${sideStem}|${sideStem}\\s*[:—–-]?\\s*${planet})((?:(?!\\.(?!\\d))[^\\n!?]){0,160})`,"giu");
          for(const match of prose.matchAll(re)) {
            if(personalFactIgnored(prose,match.index!,match[0]))continue;
            // A following planet owns its own line/color/tone/base.
            const nextPlanet=new RegExp(`(?<!\\p{L})(?:${Object.values(planetStems).join("|")})`,"iu").exec(match[1]!);
            const tail=match[1]!.slice(0,nextPlanet?.index??match[1]!.length).split(";")[0]!;
            const gate=/(?:ворот[\p{L}]*\s*[:—–-]?\s*)(\d{1,2})(?:\.(\d)(?:\.(\d)(?:\.(\d)(?:\.(\d))?)?)?)?/iu.exec(tail)
              ?? /^\s*[:—–-]?\s*(\d{1,2})\.(\d)(?:\.(\d)(?:\.(\d)(?:\.(\d))?)?)?/u.exec(tail);
            if(gate && Number(gate[1])!==activation.gate)add(`wrong_activation:${side}:${activation.body}:gate`);
            for(const [field,label,index] of [["line","лини[\\p{L}]*",2],["color","цвет[\\p{L}]*",3],["tone","тон[\\p{L}]*",4],["base","баз[\\p{L}]*",5]] as const) {
              const explicit=new RegExp(`${label}\\s*[:—–-]?\\s*(\\d+)`,"iu").exec(tail);
              const value=explicit?.[1]??gate?.[index];
              if(value!==undefined && (Number(value)!==activation[field] || (!contract.timeKnown&&field!=="line")))add(`wrong_activation:${side}:${activation.body}:${field}`);
            }
          }
        }
      }
      for (const m of s.body.matchAll(/(?:(?:ваш[\p{L}]*|определ[её]н[\p{L}]*|активн[\p{L}]*)\s+канал[\p{L}]*|канал[\p{L}]*\s*(?:у\s+вас|карты)?)\s*(\d{1,2})\s*[–-]\s*(\d{1,2})/giu)) {
        const nums = [Number(m[1]), Number(m[2])].sort((a,b) => a-b);
        if (!contract.definedChannelKeys.some(k => k.split("-").map(Number).sort((a,b) => a-b).join("-") === nums.join("-")) && !isPersonalFactNegated(s.body, m.index!)) add(`false_defined_channel:${nums.join("-")}`);
      }
      for (const m of s.body.matchAll(/(?:ваш[\p{L}]*\s+)?(?:инкарнационн[\p{L}]*\s+)?крест\s*(?:[—–:]|это)?\s*[^.\n«"]{0,80}[«"]([^»"\n]+)[»"]/giu)) {
        if (!contract.crossNameRu.toLowerCase().includes(m[1]!.toLowerCase()) && !isPersonalFactNegated(s.body, m.index!)) add(`wrong_cross_name:${m[1]}`, "V7");
      }
      for (const m of s.body.matchAll(/ваш[\p{L}]*\s+(?:инкарнационн[\p{L}]*\s+)?крест\s*(?:[—–:]|это|является)?\s*([^.!?\n]+)/giu)) {
        const clause=m[1]!.toLowerCase();
        for(const name of new Set(Object.values(CROSS_NAMES_RU).flat())) {
          const canonical=name.toLowerCase();
          if(clause.includes(canonical)&&canonical!==contract.crossNameRu.toLowerCase()&&!isPersonalFactNegated(s.body,m.index!))add(`wrong_cross_name:${name}`,"V7");
        }
      }
      if (!contract.timeKnown && ((titleKey(s.title) === "вступление") || (titleKey(s.title) === "профиль" && !contract.stableFields.profile) || (titleKey(s.title) === "тип и его особенности" && !contract.stableFields.type) || (titleKey(s.title) === "авторитет" && !contract.stableFields.authority) || titleKey(s.title) === "переменные и среда")) {
        if (!/неизвестн[\p{L}]*\s+врем|врем[\p{L}]*\s+(?:рождения\s+)?неизвест|условн|нельзя\s+(?:точно\s+)?(?:определ|подтверд)|не\s+подтвержден/iu.test(s.body)) add("missing_unknown_time_qualification");
      }
    }
    const centers = sections.find(s => titleKey(s.title) === "девять центров");
    if (centers) for (const [key, name] of Object.entries(CENTER_NAMES_RU)) {
      const first = name.split(/[\s(]/)[0]!;
        const stem = first.length <= 3 ? first : first.slice(0, -2);
      if (!new RegExp(stem, "iu").test(centers.body)) findings.push({ rule: "V6", detail: `missing_center:${key}`, sectionTitles: [centers.title] });
    }
    const channels = sections.find(s => titleKey(s.title) === "каналы");
    if (channels) for (const key of contract.definedChannelKeys) {
      const [a,b] = key.split("-");
      if (!new RegExp(`(?:${a}\\s*[–-]\\s*${b}|${b}\\s*[–-]\\s*${a})(?!\\d)`, "u").test(channels.body)) findings.push({ rule: "V6", detail: `missing_defined_channel:${key}`, sectionTitles: [channels.title] });
    }
  }

  // V10 — age bindings near mechanics (allow profile phases in periods section)
  const periods = sections.find((s) =>
    /период/i.test(s.title)
  );
  const periodsBody = periods ? `${periods.title}\n${periods.body}` : "";
  const outsidePeriods = sections
    .filter((s) => !/период/i.test(s.title))
    .map((s) => s.body)
    .join("\n");
  if (AGE_NEAR_MECHANICS.test(outsidePeriods)) {
    findings.push({ rule: "V10", detail: "age_near_mechanics_outside_periods" });
  }
  // Still block event-style ages even in periods if not phase phrasing
  const ageEvent =
    /в\s+\d{1,2}\s+лет\s+вы\s+(внезапно\s+)?(теряете|потеряете|найдёте|найдете|выйдете|разведитесь)/iu;
  if (ageEvent.test(body)) {
    findings.push({ rule: "V10", detail: "age_event_prediction" });
  }
  void PROFILE_PHASE_OK;
  void periodsBody;

  // V12 — escaped markdown
  for (const re of HD_ESCAPED_MD_PATTERNS) {
    if (re.test(body)) {
      findings.push({ rule: "V12", detail: `escaped_md:${re.source}` });
      break;
    }
  }

  return { ok: findings.length === 0, findings };
}
