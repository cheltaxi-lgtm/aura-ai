import { topicLabel } from "@/lib/session-topics";
import type { SessionTopicId } from "@/lib/session-topics";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";

type UnitKind = "card" | "rune" | "symbol" | "number";

const UNITS: Record<
  UnitKind,
  { one: string; few: string; many: string }
> = {
  card: { one: "карту", few: "карты", many: "карт" },
  rune: { one: "руну", few: "руны", many: "рун" },
  symbol: { one: "символ", few: "символа", many: "символов" },
  number: { one: "число", few: "числа", many: "чисел" },
};

const UNITS_NOM: Record<UnitKind, { one: string; few: string; many: string }> = {
  card: { one: "карта", few: "карты", many: "карт" },
  rune: { one: "руна", few: "руны", many: "рун" },
  symbol: { one: "символ", few: "символа", many: "символов" },
  number: { one: "число", few: "числа", many: "чисел" },
};

function unitKindForMaster(masterId: string): UnitKind {
  if (masterId === "ragnar") return "rune";
  if (masterId === "numerolog") return "number";
  if (masterId === "agafya" || masterId === "shri-raj") return "symbol";
  return "card";
}

function pluralForm(count: number, forms: { one: string; few: string; many: string }): string {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms.many;
  if (mod10 === 1) return forms.one;
  if (mod10 >= 2 && mod10 <= 4) return forms.few;
  return forms.many;
}

/** «3 карты», «1 карту», «5 рун» — для подписей и счётчиков. */
export function formatSpreadUnitRu(
  count: number,
  masterId: string,
  caseForm: "accusative" | "nominative" = "accusative"
): string {
  const kind = unitKindForMaster(masterId);
  const forms = caseForm === "nominative" ? UNITS_NOM[kind] : UNITS[kind];
  const word = pluralForm(count, forms);
  return `${count} ${word}`;
}

/** Только слово без числа: «карту» / «карты» / «карт». */
export function spreadUnitWordRu(count: number, masterId: string): string {
  const kind = unitKindForMaster(masterId);
  return pluralForm(count, UNITS[kind]);
}

const MASTER_RITUAL: Record<
  string,
  {
    shuffle: string;
    pick: (count: number, unit: string) => string;
    draw: (count: number, unit: string) => string;
  }
> = {
  veronika: {
    shuffle: "Колода Rider-Waite перемешана под ваш вопрос и код рождения.",
    pick: (count, unit) =>
      `Перед вами вся колода — выберите ${formatSpreadUnitRu(count, "veronika")}, ${count === 1 ? "которая" : "которые"} отклика${count === 1 ? "ется" : "ются"}. Порядок касаний задаёт позиции.`,
    draw: (count) =>
      count === 1
        ? "Откройте выбранную карту — она ваша, не случайный жребий."
        : "Откройте выбранные карты — они ваши, не случайный жребий.",
  },
  ragnar: {
    shuffle: "Руны из мешка — ваш путь, не чужой.",
    pick: (count) =>
      `Весь мешок перед вами — коснитесь ${formatSpreadUnitRu(count, "ragnar")}, ${count === 1 ? "которая" : "которые"} ${count === 1 ? "тянет" : "тянут"}.`,
    draw: (count) =>
      count === 1
        ? "Переверните выбранную руну, когда почувствуете готовность."
        : "Переверните выбранные руны, когда почувствуете готовность.",
  },
  agafya: {
    shuffle: "Знаки Рода сложились под вашу судьбу.",
    pick: (count) =>
      `Выберите ${formatSpreadUnitRu(count, "agafya")} на столе — Род откликается на ваш выбор.`,
    draw: (count) =>
      count === 1
        ? "Примите знамение — откройте выбранный символ."
        : "Примите знамение — откройте выбранные символы.",
  },
  "shri-raj": {
    shuffle: "Небесная карта собрана под вашу карму и дату.",
    pick: (count) =>
      `Укажите ${formatSpreadUnitRu(count, "shri-raj")} на столе — момент вашего выбора.`,
    draw: (count) =>
      count === 1
        ? "Откройте выбранный символ и примите послание."
        : "Откройте выбранные символы и примите послание.",
  },
  numerolog: {
    shuffle: "Числа совпали с вашим расчётом — найдите их среди знаков на столе.",
    pick: (count) =>
      count === 1
        ? "Ваше число на столе — коснитесь его, когда будете готовы."
        : `Ваши числа на столе — выберите ${formatSpreadUnitRu(count, "numerolog")} в нужном порядке.`,
    draw: (count) =>
      count === 1
        ? "Откройте выбранное число — это ваш расчёт, не абстрактная случайность."
        : "Откройте выбранные числа — это ваш расчёт, не абстрактная случайность.",
  },
  lenormand: {
    shuffle: "Колода Ленорман перемешана под ваш вопрос — 36 карт оракула на столе.",
    pick: (count) =>
      `Перед вами вся колода Ленорман — выберите ${formatSpreadUnitRu(count, "veronika")}, ${count === 1 ? "которая" : "которые"} отклика${count === 1 ? "ется" : "ются"}. Порядок касаний задаёт позиции линии.`,
    draw: (count) =>
      count === 1
        ? "Откройте выбранную карту — она ваша, не случайный жребий."
        : "Откройте выбранные карты — они ваши, не случайный жребий.",
  },
};

/** Short label for ritual UI when the user typed their own question. */
export function formatCustomQuestionRitualLabel(question: string, maxLen = 72): string {
  const q = question.replace(/\s+/g, " ").trim();
  if (!q) return "";
  if (q.length <= maxLen) return q;
  return `${q.slice(0, maxLen - 1).trim()}…`;
}

export function resolveSpreadRitualTopicLabel(options: {
  topic?: SessionTopicId | null;
  customQuestion?: string | null;
  intentSlug?: string | null;
}): string | null {
  if (options.topic === "custom" && options.customQuestion?.trim()) {
    return formatCustomQuestionRitualLabel(options.customQuestion);
  }
  const slug = options.intentSlug?.trim();
  if (slug) {
    return getSpreadIntentBySlug(slug)?.title ?? null;
  }
  return null;
}

export function getSpreadRitualCopy(
  masterId: string,
  options?: {
    topic?: SessionTopicId | null;
    /** SEO / joint-reading intent title — overrides generic «Свой вопрос» for custom topic. */
    topicLabelOverride?: string | null;
    hasBirthDate?: boolean;
    cardCount?: number;
    deckSystem?: import("@/lib/decks/types").DeckSystem;
  }
): { title: string; body: string; pickHint: string; drawHint: string; personalNote: string } {
  const count = Math.max(1, options?.cardCount ?? 3);
  const ritualKey =
    options?.deckSystem === "lenormand" ? "lenormand" : masterId;
  const base = MASTER_RITUAL[ritualKey] ?? MASTER_RITUAL.veronika;
  const unit = spreadUnitWordRu(count, masterId);
  const topic =
    options?.topicLabelOverride?.trim() ||
    (options?.topic ? topicLabel(options.topic) : null);
  const deckLabel =
    options?.deckSystem === "lenormand" ? "Колода Ленорман" : "Колода";
  const birthHint = options?.hasBirthDate
    ? `${deckLabel} учитывает вашу дату рождения.`
    : `${deckLabel} учитывает ваш вопрос и профиль.`;

  return {
    title: topic ? `Расклад · ${topic}` : "Персональный расклад",
    body: `${base.shuffle} ${birthHint} Сосредоточьтесь на вопросе — затем выберите ${formatSpreadUnitRu(count, masterId)} сами.`,
    pickHint: base.pick(count, unit),
    drawHint: base.draw(count, unit),
    personalNote: topic
      ? `Перемешано под тему «${topic}» и ваш код`
      : "Перемешано под ваш личный код",
  };
}

export function numerologRevealCopy(cardName: string, positionLabel: string): string {
  return `Число ${cardName} · ${positionLabel} — совпало с вашим расчётом`;
}
