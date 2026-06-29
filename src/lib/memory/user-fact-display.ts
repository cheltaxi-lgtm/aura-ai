import type { UserFactCategory } from "@/lib/memory/user-fact-input";

const FIRST_PERSON_VERB_RE =
  /^(живу|работаю|ищу|переживаю|планирую|собираюсь|разведён|разведена|женат|замужем|люблю|боюсь|учусь|хочу|мечтаю|жду|надеюсь|прохожу|устроился|устроилась)(?:\s|$)/i;

const VERB_TO_THIRD: Record<string, string> = {
  живу: "живёт",
  работаю: "работает",
  ищу: "ищет",
  переживаю: "переживает",
  планирую: "планирует",
  собираюсь: "собирается",
  люблю: "любит",
  боюсь: "боится",
  учусь: "учится",
  хочу: "хочет",
  мечтаю: "мечтает",
  жду: "ждёт",
  надеюсь: "надеется",
  прохожу: "проходит",
  устроился: "устроился",
  устроилась: "устроилась",
};

const VERB_TO_FIRST: Record<string, string> = Object.fromEntries(
  Object.entries(VERB_TO_THIRD).map(([first, third]) => [third, first])
);

function lcfirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function conjugatePhraseToThird(phrase: string): string {
  const trimmed = phrase.trim();
  const match = trimmed.match(/^(\S+)([\s\S]*)$/);
  if (!match) return trimmed;
  const [, verb, tail] = match;
  const third = VERB_TO_THIRD[verb.toLowerCase()];
  if (third) return `${third}${tail}`;
  return trimmed;
}

function formatWifeFact(raw: string): string {
  const wifeDob = raw.match(/^жена\s+(\S+)\s+дата рождения\s+(\d{2}\.\d{2}\.\d{4})/i);
  if (wifeDob) {
    return `Жена клиента — ${wifeDob[1]}, дата рождения ${wifeDob[2]}`;
  }
  const wifeOnly = raw.match(/^жена\s+(.+)/i);
  if (wifeOnly) {
    return `Жена клиента — ${wifeOnly[1].trim()}`;
  }
  return raw;
}

function polishStoredFact(fact: string): string {
  let t = fact.trim().replace(/\s+/g, " ");
  t = t.replace(/^у клиента\s+у клиента\s+/i, "У клиента ");
  t = t.replace(/^клиент\s+клиент\s+/i, "Клиент ");
  return t.slice(0, 600);
}

/** Normalize user input into a grammatically consistent third-person fact for the master. */
export function normalizeUserFactPhrase(fact: string): string {
  let t = fact.trim().replace(/\s+/g, " ");
  if (!t) return t;

  if (/^(у клиента|клиент)\s/i.test(t)) {
    return polishStoredFact(t);
  }
  if (/^я\s+/i.test(t)) {
    t = t.replace(/^я\s+/i, "");
    return polishStoredFact(`Клиент ${conjugatePhraseToThird(t)}`);
  }
  if (/^у меня\s+/i.test(t)) {
    t = t.replace(/^у меня\s+/i, "");
    return polishStoredFact(`У клиента ${t}`);
  }
  if (/^жена\s+/i.test(t)) {
    return polishStoredFact(formatWifeFact(t));
  }
  if (FIRST_PERSON_VERB_RE.test(t)) {
    return polishStoredFact(`Клиент ${conjugatePhraseToThird(t)}`);
  }
  if (/^\d/.test(t)) {
    return polishStoredFact(`У клиента ${t}`);
  }
  return polishStoredFact(`У клиента ${lcfirst(t)}`);
}

/** Present a stored fact in natural, readable Russian for the user's cabinet. */
export function formatMemoryFactForDisplay(fact: string): string {
  let t = fact.trim().replace(/\s+/g, " ");

  t = t.replace(
    /^у клиента\s+(?=(я\s|живу|работаю|ищу|переживаю|планирую|люблю|боюсь|учусь|хочу|мечтаю|жду|надеюсь|прохожу)(?:\s|$))/i,
    ""
  );
  t = t.replace(/^у клиента\s+/i, "");
  t = t.replace(/^клиент\s+/i, "");

  t = t.replace(/^жена клиента\s*[—-]\s*/i, "Жена — ");
  t = t.replace(/^жена\s+(\S+)\s+дата рождения\s+(\d{2}\.\d{2}\.\d{4})/i, "Жена — $1, дата рождения $2");

  const verbMatch = t.match(/^(\S+)([\s\S]*)$/);
  if (verbMatch) {
    const [, verb, tail] = verbMatch;
    const first = VERB_TO_FIRST[verb.toLowerCase()];
    if (first) {
      t = `${first}${tail}`;
    }
  }

  return capitalize(t);
}

export const FACT_CATEGORY_LABELS: Record<UserFactCategory, string> = {
  family: "Семья",
  work: "Работа",
  health: "Здоровье",
  money: "Деньги",
  relationship: "Отношения",
  event: "Событие",
  goal: "Цель",
  other: "Личное",
};

export const FACT_CATEGORY_ACCENTS: Record<
  UserFactCategory,
  { badge: string; iconWrap: string; ring: string }
> = {
  family: {
    badge: "bg-rose-500/15 text-rose-200/90 ring-rose-400/20",
    iconWrap: "bg-rose-500/15 text-rose-300",
    ring: "group-hover:border-rose-400/25",
  },
  work: {
    badge: "bg-sky-500/15 text-sky-200/90 ring-sky-400/20",
    iconWrap: "bg-sky-500/15 text-sky-300",
    ring: "group-hover:border-sky-400/25",
  },
  health: {
    badge: "bg-emerald-500/15 text-emerald-200/90 ring-emerald-400/20",
    iconWrap: "bg-emerald-500/15 text-emerald-300",
    ring: "group-hover:border-emerald-400/25",
  },
  money: {
    badge: "bg-amber-500/15 text-amber-200/90 ring-amber-400/20",
    iconWrap: "bg-amber-500/15 text-amber-300",
    ring: "group-hover:border-amber-400/25",
  },
  relationship: {
    badge: "bg-pink-500/15 text-pink-200/90 ring-pink-400/20",
    iconWrap: "bg-pink-500/15 text-pink-300",
    ring: "group-hover:border-pink-400/25",
  },
  event: {
    badge: "bg-violet-500/15 text-violet-200/90 ring-violet-400/20",
    iconWrap: "bg-violet-500/15 text-violet-300",
    ring: "group-hover:border-violet-400/25",
  },
  goal: {
    badge: "bg-indigo-500/15 text-indigo-200/90 ring-indigo-400/20",
    iconWrap: "bg-indigo-500/15 text-indigo-300",
    ring: "group-hover:border-indigo-400/25",
  },
  other: {
    badge: "bg-purple-500/15 text-purple-200/90 ring-purple-400/20",
    iconWrap: "bg-purple-500/15 text-purple-300",
    ring: "group-hover:border-purple-400/25",
  },
};

export function resolveFactCategory(category: string | null | undefined): UserFactCategory {
  if (category && category in FACT_CATEGORY_LABELS) {
    return category as UserFactCategory;
  }
  return "other";
}
