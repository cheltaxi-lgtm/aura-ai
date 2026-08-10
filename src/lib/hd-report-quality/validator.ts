import {
  HD_CROSS_ANGLE_ALL,
  HD_ESCAPED_MD_PATTERNS,
  HD_FORBIDDEN_TOPIC_PATTERNS,
  HD_META_PHRASE_PATTERNS,
  HD_TECH_JUNK_PATTERNS,
  HD_TYPE_NAMES_RU,
} from "./dictionaries";
import type { HdLockedContract } from "@/lib/hd-report-pipeline/contract";

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
};

export type HdQualityResult = {
  ok: boolean;
  findings: HdQualityFinding[];
};

const MIN_SECTION_CHARS = 120;
const MIN_REPORT_CHARS = 3500;
const SHINGLE_OVERLAP_RATIO = 0.10;
const FOCUS_ANSWER_TITLE = "Ответ на ваш запрос";

function splitSections(text: string): Array<{ title: string; body: string }> {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  const chunks = cleaned.split(/^##(?!#)\s+/m);
  const out: Array<{ title: string; body: string }> = [];
  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && chunks.length > 1) {
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
  const before = text.slice(Math.max(0, matchIndex - 96), matchIndex);
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
};

export function validateHdReportText(
  text: string,
  opts?: HdValidateOpts
): HdQualityResult {
  const findings: HdQualityFinding[] = [];
  const body = String(text || "");
  const contract = opts?.contract ?? null;

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
  const titleCounts = new Map<string, number>();
  for (const s of sections) {
    const key = s.title.trim().toLowerCase();
    titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }
  for (const [title, n] of titleCounts) {
    if (n > 1) findings.push({ rule: "V2", detail: `duplicate_title:${title}×${n}` });
  }
  const shingleSets = sections.map((s) => shingles(`${s.title} ${s.body}`));
  for (let i = 0; i < shingleSets.length; i++) {
    for (let j = i + 1; j < shingleSets.length; j++) {
      const r = overlapRatio(shingleSets[i]!, shingleSets[j]!);
      if (r > SHINGLE_OVERLAP_RATIO) {
        findings.push({
          rule: "V2",
          detail: `shingle_overlap:${sections[i]!.title}↔${sections[j]!.title}:${r.toFixed(2)}`,
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
    if (!new RegExp(engineType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(body)) {
      findings.push({ rule: "V4", detail: `missing_engine_type:${engineType}` });
    }
    for (const other of HD_TYPE_NAMES_RU) {
      if (other.toLowerCase() === engineType.toLowerCase()) continue;
      // Affirmative identity only: «Вы — Проектор». Skip «не Генератор» / «словно вы Генератор».
      const re = new RegExp(
        `(?<![\\p{L}])вы\\s*[—–-]\\s*${other.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`,
        "iu"
      );
      if (re.test(body)) {
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
    if (re.test(body)) {
      findings.push({ rule: "V5", detail: `junk:${re.source}` });
      break;
    }
  }

  if (body.trim().length < MIN_REPORT_CHARS) {
    findings.push({ rule: "V6", detail: `report_too_short:${body.trim().length}` });
  }
  for (const s of sections) {
    if (s.title !== "Запрос" && s.body.trim().length < MIN_SECTION_CHARS) {
      findings.push({
        rule: "V6",
        detail: `section_too_short:${s.title}:${s.body.trim().length}`,
      });
    }
  }
  const requireFocus = opts?.requireFocusAnswer !== false;
  if (requireFocus) {
    const hasAnswer = sections.some(
      (s) => s.title.trim().toLowerCase() === FOCUS_ANSWER_TITLE.toLowerCase()
    );
    if (!hasAnswer) {
      findings.push({ rule: "V6", detail: "missing_focus_answer_section" });
    }
  }

  // V7 — cross angle / name
  if (contract) {
    const aliases = contract.crossAngleAliases.map((a) => a.toLowerCase());
    const hasOwnAngle = aliases.some((a) =>
      body.toLowerCase().includes(a.toLowerCase())
    );
    if (!hasOwnAngle && /крест|угол/i.test(body)) {
      findings.push({
        rule: "V7",
        detail: `missing_cross_angle:${contract.crossAngleRu}`,
      });
    }
    for (const ang of HD_CROSS_ANGLE_ALL) {
      const isOwn = aliases.some((a) => a.toLowerCase() === ang.toLowerCase());
      if (isOwn) continue;
      const angRe = new RegExp(
        ang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "iu"
      );
      if (regexHitsOutsideContrast(body, angRe)) {
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
      /висяч\w*[^.\n]{0,60}?ворот[аы]?\s*(\d{1,2})|ворот[аы]?\s*(\d{1,2})[^.\n]{0,40}висяч/giu
    );
    for (const m of hangMentions) {
      const num = Number(m[1] || m[2]);
      if (!Number.isFinite(num)) continue;
      if (!hangSet.has(num)) {
        findings.push({ rule: "V8", detail: `false_hanging_gate:${num}` });
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
