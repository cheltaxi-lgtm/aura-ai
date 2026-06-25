import type { Character } from "@/types";

export const CHARACTERS: Character[] = [
  {
    id: "ragnar",
    name: "Рагнар",
    title: "Скандинавские руны",
    specialty: "Бизнес и Деньги",
    style: "Суровый, брутальный",
    emoji: "⚔️",
    gradient: "from-slate-800 via-gray-900 to-zinc-950",
    glowColor: "rgba(148, 163, 184, 0.5)",
    borderColor: "border-slate-500/40",
    priceFrom: "1 490 ₽",
    rating: 4.9,
    sessions: "320+ сеансов",
    system: "runes",
  },
  {
    id: "veronika",
    name: "Вероника",
    title: "Таро и Психология",
    specialty: "Отношения и Любовь",
    style: "Мягкий, поддерживающий",
    emoji: "🌙",
    gradient: "from-purple-900 via-violet-950 to-indigo-950",
    glowColor: "rgba(168, 85, 247, 0.5)",
    borderColor: "border-purple-500/40",
    priceFrom: "990 ₽",
    rating: 5.0,
    sessions: "580+ сеансов",
    system: "tarot-veronika",
  },
  {
    id: "agafya",
    name: "Баба Агафья",
    title: "Славянское ведовство",
    specialty: "Семья и Будущее",
    style: "Старорусский, таинственный",
    emoji: "🔮",
    gradient: "from-emerald-950 via-teal-950 to-green-950",
    glowColor: "rgba(16, 185, 129, 0.5)",
    borderColor: "border-emerald-500/40",
    priceFrom: "1 290 ₽",
    rating: 4.8,
    sessions: "410+ сеансов",
    system: "slavic",
  },
  {
    id: "shri-raj",
    name: "Гуру Шри Радж",
    title: "Джйотиш / Астрология",
    specialty: "Предназначение и Карма",
    style: "Космический",
    emoji: "✨",
    gradient: "from-amber-950 via-orange-950 to-yellow-950",
    glowColor: "rgba(245, 158, 11, 0.5)",
    borderColor: "border-amber-500/40",
    priceFrom: "1 790 ₽",
    rating: 4.9,
    sessions: "260+ сеансов",
    system: "astrology",
  },
  {
    id: "numerolog",
    name: "Эвелина",
    title: "Нумерология",
    specialty: "Числа судьбы и предназначение",
    style: "Структурный, тёплый, точный",
    emoji: "🔢",
    gradient: "from-indigo-950 via-violet-950 to-purple-950",
    glowColor: "rgba(232, 199, 126, 0.45)",
    borderColor: "border-amber-500/35",
    priceFrom: "1 290 ₽",
    rating: 4.9,
    sessions: "340+ сеансов",
    system: "numerology",
  },
];

export function getCharacterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** Heuristic: suggest master from middle (present) card meaning */
export function recommendMaster(cards: { name: string; meaning: string }[]): string {
  const present = cards[1]?.meaning.toLowerCase() ?? cards[0]?.meaning.toLowerCase() ?? "";
  const love = /любов|отношен|сердц|партн|чувств|брак/;
  const money = /денег|бизнес|работ|карьер|богат|успех|прибыл|финанс/;
  const family = /семь|дом|род|дет|матер|отец|защит/;
  const karma = /кarma|кarma|предназнач|дух|душ|смысл|путь|судьб/i;

  if (love.test(present)) return "veronika";
  if (money.test(present)) return "ragnar";
  if (family.test(present)) return "agafya";
  if (karma.test(present)) return "shri-raj";
  const numbers = /числ|цифр|код|период|этап/i;
  if (numbers.test(present)) return "numerolog";
  return "veronika";
}

export const DAILY_CARDS = [
  { name: "Солнце", meaning: "Свет пробивается сквозь тьму. Сегодня — день ясности и новых начинаний." },
  { name: "Луна", meaning: "Доверьтесь интуиции. Тайное станет явным, если прислушаетесь к внутреннему голосу." },
  { name: "Звезда", meaning: "Вселенная слышит ваши молитвы. Надежда — ваш главный союзник сегодня." },
  { name: "Башня", meaning: "Старые структуры рушатся, чтобы освободить место для истинного пути." },
  { name: "Мир", meaning: "Цикл завершён. Гармония и целостность ждут вас на горизонте." },
  { name: "Маг", meaning: "Вся сила в ваших руках. Сегодня вы — творец своей реальности." },
  { name: "Императрица", meaning: "Изобилие и творчество текут к вам. Позвольте себе принимать." },
];
