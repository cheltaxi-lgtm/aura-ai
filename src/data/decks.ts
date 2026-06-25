/**
 * Per-system Russian symbol name → deck image path (/public/decks/<system>/).
 * Keys must match names in src/lib/decks/ draw logic exactly.
 */

import type { DeckSystem } from "@/lib/decks/types";
import { normalizePhotoCardName } from "@/lib/photo-card-aliases";

const deckBase = (system: DeckSystem) => `/decks/${system}`;

function minorTarotPaths(
  system: DeckSystem,
  suitSlug: "cups" | "wands" | "swords" | "pentacles"
): Record<string, string> {
  const base = deckBase(system);
  const ranks = [
    "ace",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "page",
    "knight",
    "queen",
    "king",
  ] as const;

  const suitGenitive: Record<typeof suitSlug, string> = {
    cups: "Кубков",
    wands: "Жезлов",
    swords: "Мечей",
    pentacles: "Пентаклей",
  };

  const rankRu: Record<(typeof ranks)[number], string> = {
    ace: "Туз",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    page: "Паж",
    knight: "Рыцарь",
    queen: "Королева",
    king: "Король",
  };

  const out: Record<string, string> = {};
  for (const rank of ranks) {
    const ru = rankRu[rank];
    const label =
      rank === "ace" ? `Туз ${suitGenitive[suitSlug]}` : `${ru} ${suitGenitive[suitSlug]}`;
    out[label] = `${base}/${rank}-of-${suitSlug}.png`;
  }
  return out;
}

function majorTarotPaths(system: DeckSystem): Record<string, string> {
  const base = deckBase(system);
  return {
    Шут: `${base}/the-fool.png`,
    Маг: `${base}/the-magician.png`,
    Жрица: `${base}/the-high-priestess.png`,
    Императрица: `${base}/the-empress.png`,
    Император: `${base}/the-emperor.png`,
    Иерофант: `${base}/the-hierophant.png`,
    "Влюблённые": `${base}/the-lovers.png`,
    "Влюбленные": `${base}/the-lovers.png`,
    Колесница: `${base}/the-chariot.png`,
    Сила: `${base}/strength.png`,
    Отшельник: `${base}/the-hermit.png`,
    "Колесо Фортуны": `${base}/wheel-of-fortune.png`,
    Справедливость: `${base}/justice.png`,
    Повешенный: `${base}/the-hanged-man.png`,
    Смерть: `${base}/death.png`,
    Умеренность: `${base}/temperance.png`,
    Дьявол: `${base}/the-devil.png`,
    Башня: `${base}/the-tower.png`,
    Звезда: `${base}/the-star.png`,
    Луна: `${base}/the-moon.png`,
    Солнце: `${base}/the-sun.png`,
    Суд: `${base}/judgement.png`,
    "Страшный Суд": `${base}/judgement.png`,
    Мир: `${base}/the-world.png`,
  };
}

function buildTarotMap(system: "tarot-veronika" | "tarot-marina"): Record<string, string> {
  return {
    ...majorTarotPaths(system),
    ...minorTarotPaths(system, "cups"),
    ...minorTarotPaths(system, "wands"),
    ...minorTarotPaths(system, "swords"),
    ...minorTarotPaths(system, "pentacles"),
  };
}

export const DECK_IMAGE_MAPS: Record<DeckSystem, Record<string, string>> = {
  runes: {
    Феху: `${deckBase("runes")}/fehu.png`,
    Уруз: `${deckBase("runes")}/uruz.png`,
    Турисаз: `${deckBase("runes")}/thurisaz.png`,
    Ансуз: `${deckBase("runes")}/ansuz.png`,
    Райдо: `${deckBase("runes")}/raido.png`,
    Кеназ: `${deckBase("runes")}/kenaz.png`,
    Гебо: `${deckBase("runes")}/gebo.png`,
    Вуньо: `${deckBase("runes")}/wunjo.png`,
    Хагалаз: `${deckBase("runes")}/hagalaz.png`,
    Наутиз: `${deckBase("runes")}/nauthiz.png`,
    Иса: `${deckBase("runes")}/isa.png`,
    Йера: `${deckBase("runes")}/jera.png`,
    Эйваз: `${deckBase("runes")}/eihwaz.png`,
    Перт: `${deckBase("runes")}/perthro.png`,
    Альгиз: `${deckBase("runes")}/algiz.png`,
    Соулу: `${deckBase("runes")}/sowilo.png`,
    Тейваз: `${deckBase("runes")}/tiwaz.png`,
    Беркана: `${deckBase("runes")}/berkano.png`,
    Эваз: `${deckBase("runes")}/ehwaz.png`,
    Манназ: `${deckBase("runes")}/mannaz.png`,
    Лагуз: `${deckBase("runes")}/laguz.png`,
    Ингуз: `${deckBase("runes")}/ingwaz.png`,
    Дагаз: `${deckBase("runes")}/dagaz.png`,
    Отал: `${deckBase("runes")}/othala.png`,
  },
  "tarot-veronika": buildTarotMap("tarot-veronika"),
  "tarot-marina": buildTarotMap("tarot-marina"),
  slavic: {
    Мир: `${deckBase("slavic")}/mir.png`,
    Чернобог: `${deckBase("slavic")}/chernobog.png`,
    Алатырь: `${deckBase("slavic")}/alatyr.png`,
    Радуга: `${deckBase("slavic")}/raduga.png`,
    Нужда: `${deckBase("slavic")}/nuzhda.png`,
    Крада: `${deckBase("slavic")}/krada.png`,
    Треба: `${deckBase("slavic")}/treba.png`,
    Сила: `${deckBase("slavic")}/sila.png`,
    Ветер: `${deckBase("slavic")}/veter.png`,
    Берегиня: `${deckBase("slavic")}/bereginya.png`,
    Уд: `${deckBase("slavic")}/ud.png`,
    Леля: `${deckBase("slavic")}/lelya.png`,
    Рок: `${deckBase("slavic")}/rok.png`,
    Опора: `${deckBase("slavic")}/opora.png`,
    Даждьбог: `${deckBase("slavic")}/dazhbog.png`,
    Перун: `${deckBase("slavic")}/perun.png`,
    Исток: `${deckBase("slavic")}/istok.png`,
    Есть: `${deckBase("slavic")}/est.png`,
  },
  astrology: {
    Сурья: `${deckBase("astrology")}/surya.png`,
    Чандра: `${deckBase("astrology")}/chandra.png`,
    Мангала: `${deckBase("astrology")}/mangala.png`,
    Будха: `${deckBase("astrology")}/budha.png`,
    Гуру: `${deckBase("astrology")}/guru-jupiter.png`,
    Шукра: `${deckBase("astrology")}/shukra.png`,
    Шани: `${deckBase("astrology")}/shani.png`,
    Раху: `${deckBase("astrology")}/rahu.png`,
    Кету: `${deckBase("astrology")}/ketu.png`,
    Овен: `${deckBase("astrology")}/aries.png`,
    Телец: `${deckBase("astrology")}/taurus.png`,
    Близнецы: `${deckBase("astrology")}/gemini.png`,
    Рак: `${deckBase("astrology")}/cancer.png`,
    Лев: `${deckBase("astrology")}/leo.png`,
    Дева: `${deckBase("astrology")}/virgo.png`,
    Весы: `${deckBase("astrology")}/libra.png`,
    Скорпион: `${deckBase("astrology")}/scorpio.png`,
    Стрелец: `${deckBase("astrology")}/sagittarius.png`,
    Козерог: `${deckBase("astrology")}/capricorn.png`,
    Водолей: `${deckBase("astrology")}/aquarius.png`,
    Рыбы: `${deckBase("astrology")}/pisces.png`,
  },
  numerology: Object.fromEntries(
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "11", "22", "33"].map((n) => [
      n,
      `${deckBase("numerology")}/${n}.svg`,
    ])
  ),
};

export const DECK_BACK_PATHS: Record<DeckSystem, string> = {
  runes: `${deckBase("runes")}/_back.png`,
  "tarot-veronika": `${deckBase("tarot-veronika")}/_back.png`,
  "tarot-marina": `${deckBase("tarot-marina")}/_back.png`,
  slavic: `${deckBase("slavic")}/_back.png`,
  astrology: `${deckBase("astrology")}/_back.png`,
  numerology: `${deckBase("numerology")}/_back.svg`,
};

export function normalizeDeckName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function getDeckImagePath(system: DeckSystem, cardName: string): string {
  const resolvedName = normalizePhotoCardName(cardName) ?? normalizeDeckName(cardName);
  const key = normalizeDeckName(resolvedName);
  const map = DECK_IMAGE_MAPS[system];
  if (map[key]) return map[key];
  const relaxed = key.replace(/ё/g, "е");
  if (map[relaxed]) return map[relaxed];
  return DECK_BACK_PATHS[system];
}

export default DECK_IMAGE_MAPS;
