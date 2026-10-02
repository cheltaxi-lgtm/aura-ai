import {
  HD_CROSS_ANGLE_ALL,
  HD_ESCAPED_MD_PATTERNS,
  HD_FORBIDDEN_TOPIC_PATTERNS,
  HD_META_PHRASE_PATTERNS,
  HD_TECH_JUNK_PATTERNS,
  HD_TYPE_NAMES_RU,
} from "./dictionaries";
import type { HdLockedContract } from "@/lib/hd-report-pipeline/contract";
import type { HdConnectionReportContract } from "@/lib/human-design/connection";
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
  heart: /(?<!\p{L})эго(?!\p{L})|сердечн[\p{L}]*|(?<!\p{L})центр[\p{L}]*\s+воли/iu,
  spleen: /селез[её]н[\p{L}]*/iu,
  sacral: /сакрал[\p{L}]*/iu,
  solar: /(?<!\p{L})(?:солнечн[\p{L}]*\s+сплетени[\p{L}]*|эмоциональн[\p{L}]*\s+центр[\p{L}]*)/iu,
  root: /корнев[\p{L}]*|(?<!\p{L})кор(?:ень|ня|ню|нем)(?!\p{L})/iu,
};
const SHINGLE_OVERLAP_RATIO = 0.10;
const FOCUS_ANSWER_TITLE = "Ответ на ваш запрос";
const CHANNEL_PAIR_SEPARATOR = String.raw`(?:[—–/-]\s*|и\s+)`;

function channelForPair(a: number, b: number) {
  return a !== b ? CHANNELS.find(c => c.gates.includes(a) && c.gates.includes(b)) : undefined;
}

/** Gate subjects also claim a channel, even when the following channel ID is correct. */
function gatePairFormingChannel(clause: string): { a: number; b: number; index: number } | null {
  const formed = /(?<!\p{L})(?:образу[\p{L}]*|формиру[\p{L}]*|составля[\p{L}]*|созда[\p{L}]*|соединя[\p{L}]*\s+в)\s+(?:(?:полн|определ[её]нн|активн)[\p{L}]*\s+)?канал[\p{L}]*/iu.exec(clause);
  if (!formed || isPersonalFactNegated(clause, formed.index)) return null;
  const subject = clause.slice(Math.max(0, formed.index - 220), formed.index).split(/,\s*(?:а|но)\s+|\s+(?:при\s+этом|тогда\s+как)\s+/iu).at(-1)!;
  if (/(?:нельзя|не\s+(?:следует|нужно))\s+(?:считать|назвать|называть)\s*$/iu.test(subject)) return null;
  const gates = [...subject.matchAll(/(?<!\p{L})ворот[\p{L}]*\s+(\d{1,2})(?!\d)(?:\s*(?:и|[,/—–-])\s*(?:ворот[\p{L}]*\s+)?(\d{1,2})(?!\d))?/giu)].flatMap(m=>m[2] ? [Number(m[1]),Number(m[2])] : [Number(m[1])]);
  return gates.length === 2 ? {a:gates[0]!,b:gates[1]!,index:formed.index} : null;
}

function namedChannelPairs(clause: string): Array<{a:number;b:number;index:number;end:number}> {
  const pairs = new Map<number,{a:number;b:number;index:number;end:number}>();
  const pair = new RegExp(`^(\\d{1,2})\\s*${CHANNEL_PAIR_SEPARATOR}(\\d{1,2})(?!\\d)`,"iu");
  let consumedThrough=-1;
  for (const label of clause.matchAll(/(?<!\p{L})канал[\p{L}]*/giu)) {
    if(label.index!<consumedThrough)continue;
    let cursor=label.index!+label[0].length;
    const prefix=/^\s*(?:(?:у\s+вас|карты)\s+)?(?:(?:«[^»\n]{1,70}»|"[^"\n]{1,70}")\s*[—–:-]?\s*)?/u.exec(clause.slice(cursor))![0];
    cursor+=prefix.length;
    let current=pair.exec(clause.slice(cursor));
    while(current){
      const end=cursor+current[0].length;
      pairs.set(cursor,{a:Number(current[1]),b:Number(current[2]),index:cursor,end});
      consumedThrough=end;
      const separator=/^\s*(?:(?:\([^()\n]{0,90}\)|«[^»\n]{1,70}»)\s*)?(?:,\s*(?:и\s+)?|и\s+)(?:канал[\p{L}]*\s+)?/iu.exec(clause.slice(end));
      if(!separator)break;
      cursor=end+separator[0].length;
      current=pair.exec(clause.slice(cursor));
    }
  }
  return [...pairs.values()].sort((a,b)=>a.index-b.index);
}

function centerMentions(clause: string): Array<{key: string; index: number; end: number}> {
  const mentions = Object.entries(CENTER_MENTIONS).flatMap(([key,re]) => [...clause.matchAll(new RegExp(`(?<!\\p{L})(?:${re.source})`,"giu"))].map(m => ({key,index:m.index!,end:m.index!+m[0].length})));
  for (const m of clause.matchAll(/(?<!\p{L})эмоциональн[\p{L}]*(?=\s+и\s+(?:корнев|сакрал|горлов|селез[её]н|сердечн|теменн)[\p{L}]*\s+центр[\p{L}]*)/giu)) mentions.push({key:"solar",index:m.index!,end:m.index!+m[0].length});
  return mentions.sort((a,b) => a.index-b.index);
}

/** A list of direct channels cannot assign every channel to the same wrong pair. */
function wrongChannelClaims(clause: string, prior: string): string[] {
  if (!/канал[\p{L}]*/iu.test(clause)) return [];
  const bad: string[] = [];
  const formed = gatePairFormingChannel(clause);
  if (formed && !channelForPair(formed.a,formed.b)) bad.push(`invalid_channel_constituent_gates:${[formed.a,formed.b].sort((a,b)=>a-b).join("-")}`);
  const ids = namedChannelPairs(clause);
  for (const id of ids) {
    const prefix=clause.slice(Math.max(0,id.index-100),id.index);
    const tail=clause.slice(id.end,id.end+70);
    const negated = /(?:не\s+(?:образу|формиру|составля|созда)[\p{L}]*\s+канал[\p{L}]*\s*|не\s+канал[\p{L}]*\s*)$/iu.test(prefix)
      || /^\s*[»"”]?\s*(?:не\s+(?:существу[\p{L}]*|явля[\p{L}]*|образу[\p{L}]*)|[—–-]\s*(?:ошибк|несуществующ)[\p{L}]*)/iu.test(tail);
    if (!channelForPair(id.a,id.b) && !negated && !isPersonalFactNegated(clause,id.index)) bad.push(`invalid_channel_pair:${id.a}-${id.b}`);
  }
  if (formed) {
    const named = ids.find(id => id.index > formed.index);
    if (named && [formed.a,formed.b].sort((a,b)=>a-b).join("-") !== [named.a,named.b].sort((a,b)=>a-b).join("-")) bad.push(`wrong_channel_constituent_gates:${formed.a}-${formed.b}_vs_${named.a}-${named.b}`);
  }
  if (!ids.length) return bad;
  const connection = /соедин[еёяи][\p{L}]*|связыва[\p{L}]*|связа[\p{L}]*|между/iu.exec(clause);
  if (!connection || /(?:цепочк|опосредован|косвенн|промежуточн)/iu.test(clause) || isPersonalFactNegated(clause,connection.index) || /нельзя\s+(?:считать|назвать|называть)\s*$/iu.test(clause.slice(0,connection.index))) return bad;
  const mentions = centerMentions(clause);
  const before = mentions.filter(m => m.end <= connection.index);
  const after = mentions.filter(m => m.index >= connection.index+connection[0].length);
  const channelIsSubject = ids.every(id => id.index < connection.index) && (!before.length || before.at(-1)!.end <= ids[0]!.index);
  let endpoints = (channelIsSubject || !before.length) ? after.slice(0,2)
    : after.length ? [before.at(-1)!,after[0]!] : before.slice(-2);
  if (channelIsSubject && endpoints.length === 1 && /^(?:\s*(?:его|е[её]|их|этот\s+центр))[\s,]/iu.test(clause.slice(connection.index+connection[0].length))) {
    const antecedents = centerMentions(prior);
    if (new Set(antecedents.map(m=>m.key)).size === 1) endpoints = [antecedents[0]!,endpoints[0]!];
  }
  // More than two explicit centers can describe a network with different links.
  if (endpoints.length !== 2 || (ids.length > 1 && new Set(mentions.map(m=>m.key)).size > 2)) return bad;
  for (const id of ids) {
    const ch = channelForPair(id.a,id.b);
    if (ch && endpoints.some(c => !ch.centers.includes(c.key as typeof ch.centers[number]))) bad.push(`wrong_channel_endpoints:${id.a}-${id.b}`);
  }
  return [...new Set(bad)];
}

/** The other profile line remains lifelong; it does not own a sixth-line age phase. */
function wrongSixthLinePhaseOwner(text: string): boolean {
  const line = String.raw`(?:перв[\p{L}]*|втор[\p{L}]*|трет[\p{L}]*|четв[её]рт[\p{L}]*|пят[\p{L}]*|[1-5](?:-?[аяойюе]+)?)\s+лини[\p{L}]*`;
  const ages = String.raw`(?:от\s+)?30\s*(?:[—–-]|до|и)\s*50|после\s+(?:примерно\s+|около\s+)?50`;
  for (const sentence of text.split(/[.!?;\n]/u)) {
    if (!/(?:фаз|период|этап)/iu.test(sentence)) continue;
    const age = new RegExp(ages,"iu").exec(sentence);
    if (!age) continue;
    const tail = sentence.slice(age.index+age[0].length,age.index+age[0].length+160);
    const direct = new RegExp(String.raw`^(?:(?!,\s*(?:но|а)|\s+при\s+этом)[\s\p{L}«»():—–-]){0,70}(?:связан[\p{L}]*\s+с|принадлеж[\p{L}]*|(?:это|—|–|-)\s*(?:фаза\s+)?)\s*${line}`,"iu").exec(tail);
    if (direct && !/(?:не\s+(?:связан|принадлеж|явля)|не\s+фаза|не\s+является)/iu.test(direct[0])) return true;
    const prefix = sentence.slice(Math.max(0,age.index-100),age.index);
    if (new RegExp(`${line}\\s+(?:проход[\\p{L}]*|вступа[\\p{L}]*|имеет)\\s+(?:возрастн[\\p{L}]*\\s+)?(?:фаз[\\p{L}]*|период[\\p{L}]*)\\s*$`,"iu").test(prefix)) return true;
    if (new RegExp(`(?:фаз[\\p{L}]*|период[\\p{L}]*|этап[\\p{L}]*)\\s+${line}\\s+(?:длит[\\p{L}]*|продолжа[\\p{L}]*|начина[\\p{L}]*|занима[\\p{L}]*)\\s+(?:(?:примерно|около|с|от)\\s+)*$`,"iu").test(prefix)) return true;
  }
  return false;
}

/** Only explicit connected-group assertions; advice about interaction is not a graph claim. */
function wrongDefinitionGroups(text: string, contract: HdLockedContract): string[] {
  const bad: string[] = [];
  const marker = /(?:(?:одна|другая|первая|вторая|третья|четв[её]ртая|единая|эта|данная)\s+(?:часть|группа|блок|компонента)|(?:группа|блок|компонента)\s+\d+|(?:в\s+одну|в\s+одной)\s+групп[\p{L}]*|(?:группа|блок)\s+(?:включает|объединяет|содержит|состоит))/giu;
  for (const sentence of text.split(/[.!?;\n]/u)) {
    const markers = [...sentence.matchAll(marker)];
    for (let i = 0; i < markers.length; i++) {
      const match = markers[i]!;
      const before = sentence.slice(Math.max(0,match.index!-160), match.index);
      if (/(?:у\s+)?(?:друг[\p{L}]*|ин[\p{L}]*)\s+(?:людей|человек[\p{L}]*)[^,]{0,30}$/iu.test(before) || isPersonalFactNegated(sentence, match.index!)) continue;
      const claim = sentence.slice(match.index, markers[i + 1]?.index ?? sentence.length)
        .split(/,\s*(?:а|но)\s+|\s+(?:и\s+)?(?:взаимодейств[\p{L}]*|контактир[\p{L}]*|обменива[\p{L}]*|сравнива[\p{L}]*|сопоставля[\p{L}]*)\s+/iu)[0]!;
      const list = claim.slice(match[0].length);
      if (/^\s*(?:не\s+(?:включает|объединяет|содержит|соединяет|входят)|нельзя\s+(?:объединить|отнести|включить))/iu.test(list)) continue;
      const centers = Object.entries(CENTER_MENTIONS).filter(([key, re]) => re.test(list)
        || (key === "head" && /головн[\p{L}]*/iu.test(list))
        || (key === "solar" && /(?<!\p{L})эмоциональн[\p{L}]*(?=[^.!?\n]{0,70}центр|\s*(?:,|$|через|и\s+(?:сакрал|корнев|горлов|эго|g-|селез)))/iu.test(list))).map(([key]) => key);
      if (centers.length < 2) continue;
      const component = contract.definitionComponents.find(c => centers.every(center => c.includes(center as typeof c[number])));
      if (!component) bad.push(`wrong_definition_group:${centers.join(",")}`);
      else for (const pair of list.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s*${CHANNEL_PAIR_SEPARATOR}(\\d{1,2})(?!\\d)`,"giu"))) {
        const channel = CHANNELS.find(c => c.gates.includes(Number(pair[1])) && c.gates.includes(Number(pair[2])));
        if (channel && !channel.centers.every(c => component.includes(c))) bad.push(`wrong_definition_group_channel:${pair[1]}-${pair[2]}`);
      }
    }
  }
  return [...new Set(bad)];
}

const COUNT_WORDS: Record<string, number> = {нет:0,ноль:0,один:1,одна:1,одно:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10};
const COUNT_VALUE_PATTERN = `(?:\\d{1,2}|${Object.keys(COUNT_WORDS).join("|")})(?![\\p{L}\\d/]|\\s*[—–/-]\\s*\\d)`;
const COUNT_PATTERN = `(?<![\\p{L}\\d/—–-])${COUNT_VALUE_PATTERN}`;
const COUNT_LABEL_SEPARATOR = String.raw`(?:\s*[—–:]\s*|\s+)`;
function countValue(raw: string): number { return COUNT_WORDS[raw.toLowerCase()] ?? Number(raw); }
function escaped(raw: string): string { return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function personNamePattern(name: string): string {
  if (/^[А-Яа-яЁё]{4,}$/u.test(name)) {
    const stem = name.replace(/(?:ий|[аяйь])$/iu, "");
    return `${escaped(stem)}[\\p{L}]*`;
  }
  return escaped(name);
}
function wrongConnectionCounts(text: string, contract: HdConnectionReportContract): string[] {
  const bad: string[] = [];
  const patterns = contract.dominance.map(p => personNamePattern(p.name));
  for (let i = 0; i < contract.dominance.length; i++) {
    const person = contract.dominance[i]!;
    // Identical/overlapping names cannot identify a person safely in free prose.
    if (patterns.some((p,j) => j !== i && (new RegExp(`^${p}$`,"iu").test(person.name) || new RegExp(`^${patterns[i]}$`,"iu").test(contract.dominance[j]!.name)))) continue;
    const name = `(?<!\\p{L})${patterns[i]}(?!\\p{L})`;
    const claims = [
      new RegExp(`${name}\\s*[—–:]\\s*(${COUNT_VALUE_PATTERN})`, "giu"),
      new RegExp(`(?:у|для)\\s+${name}\\s+(?:(?:есть|насчитывается|определены|выделяются)\\s+)?(${COUNT_PATTERN})\\s+(?:доминантн[\\p{L}]*\\s+)?канал[\\p{L}]*`, "giu"),
      new RegExp(`(${COUNT_PATTERN})\\s+(?:(?:доминантн[\\p{L}]*\\s+)?канал[\\p{L}]*\\s+)?(?:принадлеж[\\p{L}]*|относ[\\p{L}]*\\s+к)\\s+${name}`, "giu"),
    ];
    for (const re of claims) for (const match of text.matchAll(re)) {
      const countIndex = match.index! + match[0].indexOf(match[1]!);
      if (/\d\s*[—–/\-]\s*$/u.test(text.slice(Math.max(0,countIndex-20),countIndex))) continue;
      const tail = text.slice(countIndex+match[1]!.length,countIndex+match[1]!.length+100);
      if (/^\s*\.\d{1,2}\.\d{4}(?!\d)/u.test(tail) || /^\s*[—–-]\s*(?:летн|годовал)[\p{L}]*/iu.test(tail)) continue;
      // Named ages, profile lines and center/gate totals have their own units.
      // They remain personal facts even inside a dominance discussion.
      if (/^\s*(?:-[аяойюе]+)?\s+(?:(?:определ[её]нн|открыт|моторн|активн|полн)[\p{L}]*\s+)?(?:лет|год[\p{L}]*|месяц[\p{L}]*|дн[\p{L}]*|лини[\p{L}]*|центр[\p{L}]*|ворот[\p{L}]*|январ[\p{L}]*|феврал[\p{L}]*|март[\p{L}]*|апрел[\p{L}]*|ма[йя]|июн[\p{L}]*|июл[\p{L}]*|август[\p{L}]*|сентябр[\p{L}]*|октябр[\p{L}]*|ноябр[\p{L}]*|декабр[\p{L}]*)(?!\p{L})/iu.test(tail)) continue;
      // A person's total defined/shared channels is a different statistic.
      // Preserve explicit "defined dominance channels" as a dominance claim.
      const qualified = /^\s+(?:определ[её]нн|полн|личн|индивидуальн|собственн|общ|активн)[\p{L}]*\s+канал[\p{L}]*/iu.exec(tail);
      // A statistic label also owns its Markdown list across line breaks.
      const context = text.slice(Math.max(0,match.index!-256),match.index);
      const labels = [...context.matchAll(/доминантн[\p{L}]*\s+канал[\p{L}]*\s*[:—–]|(?:индивидуальн|личн|собственн)[\p{L}]*\s+карт[\p{L}]*/giu)];
      const dominanceList = labels.length > 0 && /^доминантн/iu.test(labels.at(-1)![0]);
      if (qualified && !dominanceList && !/^\s+доминантн/iu.test(tail.slice(qualified[0].length))) continue;
      if (!isPersonalFactNegated(text,match.index!) && countValue(match[1]!) !== person.channelKeys.length) bad.push(`wrong_connection_dominance_count:${person.name}:${match[1]}_vs_${person.channelKeys.length}`);
    }
  }
  for (const match of text.matchAll(new RegExp(`(?:всего|суммарно)${COUNT_LABEL_SEPARATOR}(${COUNT_VALUE_PATTERN})\\s+доминантн[\\p{L}]*\\s+канал[\\p{L}]*`,"giu"))) {
    if (!isPersonalFactNegated(text,match.index!) && countValue(match[1]!) !== contract.dominanceCount) bad.push(`wrong_connection_dominance_total:${match[1]}_vs_${contract.dominanceCount}`);
  }
  // The canonical evidence summary uses a bare "Всего — 7" after the
  // dominance label. Its nearest statistic label owns that abbreviated total.
  for (const match of text.matchAll(new RegExp(`(?<!\\p{L})(?:всего|суммарно)${COUNT_LABEL_SEPARATOR}(${COUNT_VALUE_PATTERN})(?=\\s*(?:[.!?;,\\n]|$))`,"giu"))) {
    const context=text.slice(Math.max(0,match.index!-256),match.index);
    const labels=[...context.matchAll(/(?<!\p{L})(?:(?:доминантн|компромиссн|общ|полн|определ[её]нн|электромагнитн)[\p{L}]*\s+канал[\p{L}]*|компромисс[\p{L}]*|(?:индивидуальн|личн|собственн)[\p{L}]*\s+карт[\p{L}]*|(?:центр|ворот|профил)[\p{L}]*)(?:\s*\([^()\n]{0,90}\))?\s*[:—–]/giu)];
    if (labels.length && /^доминантн/iu.test(labels.at(-1)![0]) && !isPersonalFactNegated(text,match.index!) && countValue(match[1]!)!==contract.dominanceCount) bad.push(`wrong_connection_dominance_total:${match[1]}_vs_${contract.dominanceCount}`);
  }
  for (const match of text.matchAll(new RegExp(`(?<!\\p{L})компромиссн[\\p{L}]*\\s+канал[\\p{L}]*${COUNT_LABEL_SEPARATOR}(${COUNT_VALUE_PATTERN})`,"giu"))) {
    if (!isPersonalFactNegated(text,match.index!) && countValue(match[1]!) !== contract.compromiseCount) bad.push(`wrong_connection_compromise_count:${match[1]}_vs_${contract.compromiseCount}`);
  }
  return [...new Set(bad)];
}

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
  connectionContract?: HdConnectionReportContract | null;
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
  for (const section of sections) {
    if (/(?<![\p{L}])(?:dominance[AB]|compromise[AB]|aOnly|bOnly|companionship)(?![\p{L}])/u.test(section.body)) findings.push({rule:"V5",detail:"internal_connection_label",sectionTitles:[section.title]});
    if (opts?.connectionContract && (titleKey(section.title) === "доминантность и компромисс" || /(?<!\p{L})(?:доминантн[\p{L}]*|компромиссн[\p{L}]*\s+канал)/iu.test(section.body))) {
      for (const detail of wrongConnectionCounts(section.body,opts.connectionContract)) findings.push({rule:"V4",detail,sectionTitles:[section.title]});
    }
  }
  for (const s of sections) for (const sentence of s.body.matchAll(/[^.!?;\n]+/gu)) {
    const clause = sentence[0];
    for (const gate of clause.matchAll(/(?<!\p{L})канал\s+(\d{1,2})(?!\d)/giu)) {
      const tail = clause.slice(gate.index!+gate[0].length);
      const quotedNegation = /(?<!\p{L})не\s*[«“"]\s*$/iu.test(clause.slice(Math.max(0,gate.index!-60),gate.index));
      if (!/^\s*(?:[–—/-]\s*\d{1,2}(?!\d)|и\s+\d{1,2}(?!\d))/iu.test(tail) && !quotedNegation && !isPersonalFactNegated(clause,gate.index!)) {
        findings.push({rule:"V4",detail:`single_gate_called_channel:${gate[1]}`,sectionTitles:[s.title]});
      }
    }
    const prior = s.body.slice(Math.max(0,sentence.index!-256),sentence.index).split(/\n\s*\n/u).at(-1) ?? "";
    for (const detail of wrongChannelClaims(clause,prior)) findings.push({rule:"V4",detail,sectionTitles:[s.title]});
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
      for (const detail of wrongDefinitionGroups(s.body, contract)) add(detail);
      if (wrongSixthLinePhaseOwner(s.body)) add("wrong_sixth_line_phase_owner","V10");
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
      for (const m of s.body.matchAll(new RegExp(String.raw`(?:(?:ваш[\p{L}]*|определ[её]н[\p{L}]*|активн[\p{L}]*)\s+канал[\p{L}]*|канал[\p{L}]*\s*(?:у\s+вас|карты)?)\s*(\d{1,2})\s*${CHANNEL_PAIR_SEPARATOR}(\d{1,2})(?!\d)`,"giu"))) {
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
      if (!new RegExp(`(?<!\\d)(?:${a}\\s*${CHANNEL_PAIR_SEPARATOR}${b}|${b}\\s*${CHANNEL_PAIR_SEPARATOR}${a})(?!\\d)`, "iu").test(channels.body)) findings.push({ rule: "V6", detail: `missing_defined_channel:${key}`, sectionTitles: [channels.title] });
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
