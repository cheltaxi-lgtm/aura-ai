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
    priceFrom: "по тарифу ᚢ",
    system: "runes",
  },
  {
    id: "veronika",
    name: "Вероника",
    title: "Таро и Психология",
    specialty: "Отношения и Любовь",
    style: "Мягкий, поддерживающий",
    emoji: "🌙",
    gradient: "from-stone-900 via-[#1a1410] to-[#0a0908]",
    glowColor: "rgba(201, 162, 74, 0.35)",
    borderColor: "border-amber-500/30",
    priceFrom: "по тарифу ᚢ",
    system: "tarot-veronika",
  },
  {
    id: "agafya",
    name: "Баба Агафья",
    title: "Славянское ведовство",
    specialty: "Семья и Будущее",
    style: "Старорусский, таинственный",
    emoji: "🌿",
    gradient: "from-emerald-950 via-teal-950 to-green-950",
    glowColor: "rgba(16, 185, 129, 0.35)",
    borderColor: "border-emerald-500/40",
    priceFrom: "по тарифу ᚢ",
    system: "slavic",
  },
  {
    id: "shri-raj",
    name: "Гуру Шри Радж",
    title: "Джйотиш / Астрология",
    specialty: "Предназначение и Карма",
    style: "Спокойный, точный",
    emoji: "✨",
    gradient: "from-amber-950 via-orange-950 to-yellow-950",
    glowColor: "rgba(245, 158, 11, 0.4)",
    borderColor: "border-amber-500/40",
    priceFrom: "по тарифу ᚢ",
    system: "astrology",
  },
  {
    id: "numerolog",
    name: "Эвелина",
    title: "Нумерология",
    specialty: "Числа судьбы и предназначение",
    style: "Структурный, тёплый, точный",
    emoji: "◇",
    gradient: "from-[#1a1816] via-[#141210] to-[#0a0908]",
    glowColor: "rgba(232, 199, 126, 0.4)",
    borderColor: "border-amber-500/35",
    priceFrom: "по тарифу ᚢ",
    system: "numerology",
  },
];

export function getCharacterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

export function getCharacterIds(): string[] {
  return CHARACTERS.map((c) => c.id);
}

/** Heuristic: suggest master from middle (present) card meaning */
export function recommendMaster(cards: { name: string; meaning: string }[]): string {
  const present = cards[1]?.meaning.toLowerCase() ?? cards[0]?.meaning.toLowerCase() ?? "";
  const love = /любов|отношен|сердц|партн|чувств|брак/;
  const money = /денег|бизнес|работ|карьер|богат|успех|прибыл|финанс/;
  const family = /семь|дом|род|дет|матер|отец|защит/;
  const karma = /karma|karma|предназнач|дух|душ|смысл|путь|судьб/i;

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
