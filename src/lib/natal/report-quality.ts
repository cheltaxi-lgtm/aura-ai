import type { NatalEvidence } from "./evidence";

export type NatalSectionKey =
  | "summary"
  | "personality"
  | "relationships"
  | "career"
  | "resources"
  | "tensions"
  | "currentPeriod"
  | "recommendations";

const SECTION_KEYS: readonly NatalSectionKey[] = [
  "summary",
  "personality",
  "relationships",
  "career",
  "resources",
  "tensions",
  "currentPeriod",
  "recommendations",
] as const;

/** Product roles: each section has one job; no essay filler. */
export const SECTION_ROLE_CONTRACTS: Record<NatalSectionKey, string> = {
  summary:
    "Итог: 3–5 плотных предложений — главные темы окна/карты. Только тезис. Без списка советов и без пересказа других разделов.",
  personality:
    "Личность: как человек проявляется (Солнце/Луна/ASC или ведические аналоги из evidence). Конкретные факторы → характер. Без общих «у тебя есть потенциал».",
  relationships:
    "Отношения: Венера/Марс/7 дом или ведические аналоги из evidence. Как строится близость и трение. Без универсальных советов «говори открыто».",
  career:
    "Карьера: MC/10 дом/Сатурн/Юпитер из evidence. Где сила и где давление в деле. Без мотивационных лозунгов.",
  resources:
    "Ресурсы: 2 дом/деньги/поддержка из evidence. Как приходит и уходит энергия/средства. Без финансовых гарантий.",
  tensions:
    "Напряжения: жёсткие аспекты и уроки из evidence. Где трение и что с ним делать по сути, без драмы.",
  currentPeriod:
    "Текущий период: датированная шкала — транзиты, ингрессии, солнечное возвращение, прогрессии/даши из timing evidence. Даты и факторы. Не пересказывай summary и не давай список советов.",
  recommendations:
    "Рекомендации: императив — 3–5 конкретных действий на период/карту. Каждое действие связано с названным фактором из evidence. Запрещено повторять формулировки summary или currentPeriod.",
};

/** Short UI hint under the section title. */
export const SECTION_ROLE_SUBTITLES: Record<NatalSectionKey, string> = {
  summary: "итог",
  personality: "как ты устроен",
  relationships: "близость и трение",
  career: "дело и призвание",
  resources: "энергия и средства",
  tensions: "точки давления",
  currentPeriod: "даты и пики",
  recommendations: "что делать",
};

const FORECAST_TIMING_KEYS = new Set<NatalSectionKey>([
  "summary",
  "currentPeriod",
  "recommendations",
]);

export function isForecastTimingSection(key: NatalSectionKey): boolean {
  return FORECAST_TIMING_KEYS.has(key);
}

export function natalSectionRoleSubtitle(key: string | undefined | null): string | null {
  if (!key) return null;
  if (!(SECTION_KEYS as readonly string[]).includes(key)) return null;
  return SECTION_ROLE_SUBTITLES[key as NatalSectionKey] ?? null;
}

export function normalizeClaimText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeClaimText(text)
      .split(" ")
      .filter((t) => t.length > 2)
  );
}

/** Jaccard similarity on tokens longer than 2 chars. */
export function claimTextSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export type NearDuplicatePair = {
  a: NatalSectionKey;
  b: NatalSectionKey;
  score: number;
};

type ReportLike = {
  sections: Array<{ key: string; claims: Array<{ text: string }> }>;
};

/**
 * Find near-duplicate section bodies. Timing trio is checked first —
 * that's the product bug (summary ≈ recommendations).
 */
export function findNearDuplicateSections(
  report: ReportLike,
  threshold = 0.68
): NearDuplicatePair[] {
  const bodies = new Map<string, string>();
  for (const section of report.sections) {
    const body = section.claims.map((c) => c.text).join("\n");
    bodies.set(section.key, body);
  }
  const pairs: Array<[NatalSectionKey, NatalSectionKey]> = [
    ["summary", "recommendations"],
    ["summary", "currentPeriod"],
    ["currentPeriod", "recommendations"],
    ["personality", "relationships"],
    ["career", "resources"],
  ];
  const out: NearDuplicatePair[] = [];
  for (const [a, b] of pairs) {
    const ta = bodies.get(a);
    const tb = bodies.get(b);
    if (!ta || !tb) continue;
    const score = claimTextSimilarity(ta, tb);
    if (score >= threshold) out.push({ a, b, score });
  }
  return out;
}

const STOP_WORDS = new Set([
  "этот",
  "эта",
  "эти",
  "того",
  "для",
  "при",
  "или",
  "как",
  "что",
  "это",
  "раздел",
  "период",
  "тема",
  "темы",
  "фактор",
  "карта",
  "натальной",
  "натальная",
  "прогноз",
  "горизонте",
  "выбранном",
]);

/** Extract concrete anchors (planet/sign/date fragments) from evidence strings. */
export function extractEvidenceAnchors(item: NatalEvidence): string[] {
  const raw = `${item.label} ${item.value}`;
  const anchors = new Set<string>();
  for (const m of raw.matchAll(/\d{4}-\d{2}-\d{2}/g)) anchors.add(m[0]!);
  for (const m of raw.matchAll(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/g)) {
    anchors.add(normalizeClaimText(m[0]!));
  }
  for (const token of normalizeClaimText(raw).split(" ")) {
    if (token.length < 4 || STOP_WORDS.has(token)) continue;
    anchors.add(token);
  }
  return [...anchors];
}

/**
 * True when claim text visibly names something from the cited evidence
 * (planet, sign, date, label fragment) — not just an ID in JSON.
 */
export function claimHasEvidenceAnchor(
  text: string,
  cited: readonly NatalEvidence[]
): boolean {
  if (!cited.length) return false;
  const norm = normalizeClaimText(text);
  if (!norm) return false;
  if (
    /\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:[./]|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(
      text
    )
  ) {
    return true;
  }
  for (const item of cited) {
    for (const anchor of extractEvidenceAnchors(item)) {
      if (anchor.length >= 4 && norm.includes(anchor)) return true;
    }
  }
  return false;
}

/** Expanded fluff / template phrases that must not pass as premium prose. */
export const NATAL_FLUFF_RE =
  /(?:натальная карта указывает|вы обладаете потенциалом|у тебя есть потенциал|могут возникать изменения|возможны изменения|сфокусируйтесь на своих целях|сосредоточься на целях|практический акцент|интерпретация символическая и вероятностная|этот рассчитанный фактор задаёт основную тему|ключевой вывод по разделу)/i;
