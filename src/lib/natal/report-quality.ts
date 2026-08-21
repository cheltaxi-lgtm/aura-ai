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

/** Shared voice for every natal/forecast/compatibility LLM delivery. */
export const NATAL_HUMAN_VOICE = `Пиши как умный друг, а не как учебник астрологии и не как расклад Таро.
Запрещены слова «расклад», «карты», «колода» — это натальный отчёт или прогноз.
Каждый абзац: сначала жизненный смысл простыми словами (настроение, отношения, дело, деньги, силы), потом одной короткой фразой отсылка к фактору из evidence (планета, аспект или дата).
Не начинай предложение с названия планеты или аспекта. В основном тексте не используй орб, ингрессию, куспид, ASC, MC, лагну как якоря речи.
Не делай справочник («Сатурн значит ограничение»). Связывай 2–3 фактора в один жизненный сценарий и дай практический вывод, который человек узнает в своей неделе.`;

/** Product roles: each section has one job; no essay filler. */
export const SECTION_ROLE_CONTRACTS: Record<NatalSectionKey, string> = {
  summary:
    "Итог простыми словами: 3–5 предложений — главные жизненные темы карты. Только тезис. Без списка советов, без пересказа других разделов и без перечня планет.",
  personality:
    "Как человек проявляется в жизни. Характер и привычки — человеческим языком; фактор из evidence упомяни один раз как опору, не как лекцию.",
  relationships:
    "Как строится близость и где повторяется трение. Бытовые сцены, не каталог Венеры/Марса/7 дома.",
  career:
    "Где в деле сила и где давление. Рабочие ситуации, не MC/10 дом как заголовок.",
  resources:
    "Куда уходят и откуда возвращаются силы и средства. Без финансовых гарантий и без лекции про 2 дом.",
  tensions:
    "Где будет тесно и что с этим делать по сути, без драмы и без перечня жёстких аспектов.",
  currentPeriod:
    "Что сейчас на календаре: даты человеческим языком и одна короткая отсылка к фактору. Не пересказывай summary и не давай список советов.",
  recommendations:
    "Что сделать в быту: 3–5 конкретных шагов. Каждый шаг связан с фактором из evidence, но звучит как совет человеку, а не как «работай с транзитом». Не повторяй summary и currentPeriod.",
};

/** Forecast roles: the window is the subject, not the natal encyclopedia. */
export const FORECAST_SECTION_ROLE_CONTRACTS: Record<NatalSectionKey, string> = {
  summary:
    "Что важно в этом окне простыми словами: 2–3 жизненные темы. Без советов и без списка планет.",
  personality:
    "Как окно может сдвинуть настроение, темп и привычки. Не пересказывай всю натальную личность.",
  relationships:
    "Что может обостриться или потеплеть в близости в эти дни. Сцены из жизни, не каталог аспектов.",
  career:
    "Где в работе будет давление или попутный ветер. Конкретные рабочие ситуации.",
  resources:
    "Силы и деньги: что беречь и куда не сливать зря. Без гарантий дохода.",
  tensions:
    "Где будет тесно и как не накручивать себя. Один управляемый шаг, не драма.",
  currentPeriod:
    "Когда именно ждать пики: даты как «после 12 августа», фактор — одной короткой отсылкой. Не советы и не повтор summary.",
  recommendations:
    "Что сделать на этом горизонте: конкретные бытовые шаги с датой или поводом из evidence. Запрещено «работай с транзитом Сатурна».",
};

export const FORECAST_SECTION_TITLES: Record<NatalSectionKey, string> = {
  summary: "Что важно сейчас",
  personality: "Настроение",
  relationships: "Близость",
  career: "Дело",
  resources: "Силы и деньги",
  tensions: "Где будет тесно",
  currentPeriod: "Когда именно",
  recommendations: "Что делать",
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

export const FORECAST_SECTION_ROLE_SUBTITLES: Record<NatalSectionKey, string> = {
  summary: "главное за окно",
  personality: "настроение в эти дни",
  relationships: "что будет с близостью",
  career: "работа и нагрузка",
  resources: "силы и деньги",
  tensions: "где будет тесно",
  currentPeriod: "даты простыми словами",
  recommendations: "что сделать",
};

const FORECAST_TIMING_KEYS = new Set<NatalSectionKey>([
  "summary",
  "currentPeriod",
  "recommendations",
]);

export function isForecastTimingSection(key: NatalSectionKey): boolean {
  return FORECAST_TIMING_KEYS.has(key);
}

export function natalSectionRoleSubtitle(
  key: string | undefined | null,
  reportType?: "interpretation" | "forecast" | string | null
): string | null {
  if (!key) return null;
  if (!(SECTION_KEYS as readonly string[]).includes(key)) return null;
  const typed = key as NatalSectionKey;
  if (reportType === "forecast") return FORECAST_SECTION_ROLE_SUBTITLES[typed] ?? null;
  return SECTION_ROLE_SUBTITLES[typed] ?? null;
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
