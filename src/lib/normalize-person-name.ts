/**
 * Normalize a person display name for RU product UX:
 * - keep first name only (drop surname / patronymic / OAuth leftovers)
 * - map common Latin OAuth spellings to Russian given names
 * - phonetic Latin→Cyrillic fallback for unknown names
 */

const KNOWN_FIRST_NAMES: Record<string, string> = {
  // Male
  alexander: "Александр",
  alexandr: "Александр",
  aleksandr: "Александр",
  alex: "Алекс",
  alexey: "Алексей",
  alexei: "Алексей",
  aleksey: "Алексей",
  andrey: "Андрей",
  andrei: "Андрей",
  andrew: "Андрей",
  anton: "Антон",
  boris: "Борис",
  daniil: "Даниил",
  daniel: "Даниил",
  denis: "Денис",
  dmitry: "Дмитрий",
  dmitriy: "Дмитрий",
  dmitri: "Дмитрий",
  dimitri: "Дмитрий",
  eugene: "Евгений",
  evgeny: "Евгений",
  evgeniy: "Евгений",
  gennady: "Геннадий",
  gennadiy: "Геннадий",
  gennadi: "Геннадий",
  genadiy: "Геннадий",
  georgy: "Георгий",
  george: "Георгий",
  grigory: "Григорий",
  igor: "Игорь",
  ivan: "Иван",
  john: "Иван",
  kirill: "Кирилл",
  konstantin: "Константин",
  leonid: "Леонид",
  maxim: "Максим",
  maksim: "Максим",
  michael: "Михаил",
  mikhail: "Михаил",
  nikita: "Никита",
  nikolay: "Николай",
  nikolai: "Николай",
  nicholas: "Николай",
  oleg: "Олег",
  pavel: "Павел",
  paul: "Павел",
  petr: "Пётр",
  peter: "Пётр",
  pyotr: "Пётр",
  roman: "Роман",
  sergey: "Сергей",
  sergei: "Сергей",
  sergej: "Сергей",
  stanislav: "Станислав",
  stepan: "Степан",
  timothy: "Тимофей",
  timofey: "Тимофей",
  vadim: "Вадим",
  valentin: "Валентин",
  vasily: "Василий",
  vasiliy: "Василий",
  victor: "Виктор",
  viktor: "Виктор",
  vladimir: "Владимир",
  vladislav: "Владислав",
  yuri: "Юрий",
  yury: "Юрий",
  yuriy: "Юрий",

  // Female
  alexandra: "Александра",
  aleksandra: "Александра",
  alina: "Алина",
  alisa: "Алиса",
  alice: "Алиса",
  alla: "Алла",
  anastasia: "Анастасия",
  anastasiya: "Анастасия",
  angela: "Анжела",
  anna: "Анна",
  anne: "Анна",
  daria: "Дарья",
  darya: "Дарья",
  diana: "Диана",
  ekaterina: "Екатерина",
  katerina: "Екатерина",
  catherine: "Екатерина",
  elena: "Елена",
  helena: "Елена",
  yelena: "Елена",
  elizabeth: "Елизавета",
  elizaveta: "Елизавета",
  galina: "Галина",
  irina: "Ирина",
  julia: "Юлия",
  yulia: "Юлия",
  yuliya: "Юлия",
  kristina: "Кристина",
  christina: "Кристина",
  ksenia: "Ксения",
  kseniya: "Ксения",
  xenia: "Ксения",
  larisa: "Лариса",
  lidia: "Лидия",
  lidiya: "Лидия",
  lyubov: "Любовь",
  lubov: "Любовь",
  maria: "Мария",
  mariya: "Мария",
  mary: "Мария",
  marina: "Марина",
  nadezhda: "Надежда",
  natalia: "Наталья",
  natalya: "Наталья",
  natalie: "Наталья",
  olga: "Ольга",
  oxana: "Оксана",
  oksana: "Оксана",
  polina: "Полина",
  sofia: "София",
  sofya: "Софья",
  sophia: "София",
  svetlana: "Светлана",
  tatiana: "Татьяна",
  tatyana: "Татьяна",
  valentina: "Валентина",
  vera: "Вера",
  victoria: "Виктория",
  viktoriya: "Виктория",
  zhanna: "Жанна",
  jeanne: "Жанна",
};

const DIGRAPHS: Array<[RegExp, string]> = [
  [/shch/g, "щ"],
  [/sch/g, "щ"],
  [/yo/g, "ё"],
  [/zh/g, "ж"],
  [/kh/g, "х"],
  [/ts/g, "ц"],
  [/ch/g, "ч"],
  [/sh/g, "ш"],
  [/yu/g, "ю"],
  [/ya/g, "я"],
  [/ye/g, "е"],
  [/iy$/g, "ий"],
  [/yy$/g, "ый"],
];

const LATIN_LETTERS: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "и",
  z: "з",
};

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_RE = /[a-zA-Z]/;

function titleCaseRu(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function stripNoise(raw: string): string {
  return raw
    .replace(/@.+$/, "") // email local-part leftover
    .replace(/[._]+/g, " ")
    .replace(/["'«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstToken(raw: string): string {
  const cleaned = stripNoise(raw);
  if (!cleaned) return "";
  // Prefer first alphabetic token (skip initials like "G.")
  const parts = cleaned.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const token = part.replace(/[^a-zA-Z\u0400-\u04FFёЁ-]/g, "");
    if (token.length >= 2) return token;
  }
  return parts[0]?.replace(/[^a-zA-Z\u0400-\u04FFёЁ-]/g, "") ?? "";
}

function transliterateLatinToken(token: string): string {
  const lower = token.toLowerCase();
  if (KNOWN_FIRST_NAMES[lower]) return KNOWN_FIRST_NAMES[lower];

  let value = lower;
  for (const [pattern, replacement] of DIGRAPHS) {
    value = value.replace(pattern, replacement);
  }
  value = [...value].map((ch) => LATIN_LETTERS[ch] ?? (CYRILLIC_RE.test(ch) ? ch : "")).join("");
  return value ? titleCaseRu(value) : "";
}

/**
 * Returns a short Russian given name suitable for UI address forms.
 * Empty string if nothing usable.
 */
export function normalizePersonDisplayName(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const token = firstToken(raw);
  if (!token) return "";

  if (CYRILLIC_RE.test(token) && !LATIN_RE.test(token)) {
    return titleCaseRu(token);
  }

  // Mixed or Latin → known map / transliteration
  if (LATIN_RE.test(token)) {
    return transliterateLatinToken(token);
  }

  return titleCaseRu(token);
}

/** Same as normalizePersonDisplayName, with a soft fallback label. */
export function normalizePersonDisplayNameOr(
  raw: string | null | undefined,
  fallback = ""
): string {
  return normalizePersonDisplayName(raw) || fallback;
}
