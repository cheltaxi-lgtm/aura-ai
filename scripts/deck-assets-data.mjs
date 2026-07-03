/**
 * Shared deck asset definitions for scripts/build-decks.mjs
 * Keep in sync with src/data/decks.ts and src/lib/decks/
 */

export const DECK_SYSTEMS = [
  "runes",
  "tarot-veronika",
  "tarot-marina",
  "slavic",
  "astrology",
  "lenormand",
];

export const STYLE_BASE = {
  runes:
    "ancient Norse rune carved into dark weathered stone, glowing molten gold engraving, cold iron texture, harsh dramatic lighting, centered, vertical card, ornate steel-gold border",
  "tarot-veronika":
    "Rider-Waite style tarot card, soft warm golden light, gentle mystical watercolor, elegant gold border, vertical card",
  "tarot-marina":
    "tarot card, moonlit deep-blue and gold, ethereal celestial mood, refined elegant gold filigree border, vertical card",
  slavic:
    "old Slavic sacred symbol Reza Roda, carved wooden old-russian style, deep red and gold ornament border, ancient mystical, centered, vertical card",
  astrology:
    "Vedic Jyotish celestial symbol, deep indigo cosmic starfield, glowing gold celestial line-art, sacred geometry, vertical card",
  lenormand:
    "Petit Lenormand oracle card, vintage European illustration, soft cream and muted teal, elegant thin border, clear symbolic vignette, vertical card",
};

export const RUNES = [
  ["fehu", "Феху", "wealth, cattle, primal energy"],
  ["uruz", "Уруз", "strength, endurance"],
  ["thurisaz", "Турисаз", "thunder, protection"],
  ["ansuz", "Ансуз", "wisdom, divine message"],
  ["raido", "Райдо", "journey, movement"],
  ["kenaz", "Кеназ", "torch, knowledge"],
  ["gebo", "Гебо", "gift, exchange"],
  ["wunjo", "Вуньо", "joy, harmony"],
  ["hagalaz", "Хагалаз", "hail, disruption"],
  ["nauthiz", "Наутиз", "need, constraint"],
  ["isa", "Иса", "ice, stillness"],
  ["jera", "Йера", "harvest, cycle"],
  ["eihwaz", "Эйваз", "yew tree, protection"],
  ["perthro", "Перт", "fate, mystery"],
  ["algiz", "Альгиз", "protection, elk"],
  ["sowilo", "Соулу", "sun, victory"],
  ["tiwaz", "Тейваз", "warrior, justice"],
  ["berkano", "Беркана", "birch, growth"],
  ["ehwaz", "Эваз", "horse, partnership"],
  ["mannaz", "Манназ", "humanity, self"],
  ["laguz", "Лагуз", "water, intuition"],
  ["ingwaz", "Ингуз", "fertility, inner power"],
  ["dagaz", "Дагаз", "daybreak, breakthrough"],
  ["othala", "Отал", "heritage, home"],
];

export const SLAVIC = [
  ["mir", "Мир", "world harmony"],
  ["chernobog", "Чернобог", "shadow god"],
  ["alatyr", "Алатырь", "world stone"],
  ["raduga", "Радуга", "rainbow bridge"],
  ["nuzhda", "Нужда", "need, trial"],
  ["krada", "Крада", "secret knowledge"],
  ["treba", "Треба", "ritual offering"],
  ["sila", "Сила", "spiritual power"],
  ["veter", "Ветер", "wind of change"],
  ["bereginya", "Берегиня", "protectress"],
  ["ud", "Уд", "good fortune"],
  ["lelya", "Леля", "love, tenderness"],
  ["rok", "Рок", "fate"],
  ["opora", "Опора", "foundation"],
  ["dazhbog", "Даждьбог", "sun god of plenty"],
  ["perun", "Перун", "thunder god"],
  ["istok", "Исток", "source, origin"],
  ["est", "Есть", "being, essence"],
];

export const ASTROLOGY = [
  ["surya", "Сурья", "Sun graha"],
  ["chandra", "Чандра", "Moon graha"],
  ["mangala", "Мангала", "Mars graha symbol, dark indigo cosmic starfield, gold line art, full bleed frame"],
  ["budha", "Будха", "Mercury graha"],
  ["guru-jupiter", "Гуру", "Jupiter graha symbol, dark indigo cosmic starfield, gold line art, full bleed frame"],
  ["shukra", "Шукра", "Venus graha"],
  ["shani", "Шани", "Saturn Shani graha symbol, distinct gold glyph on deep indigo cosmic starfield"],
  ["rahu", "Раху", "Rahu north node symbol, gold glyph on deep indigo cosmic starfield, no white borders"],
  ["ketu", "Кету", "Ketu node"],
  ["aries", "Овен", "Aries zodiac"],
  ["taurus", "Телец", "Taurus zodiac bull horns symbol on deep indigo cosmic starfield"],
  ["gemini", "Близнецы", "Gemini zodiac"],
  ["cancer", "Рак", "Cancer zodiac"],
  ["leo", "Лев", "Leo zodiac"],
  ["virgo", "Дева", "Virgo zodiac maiden symbol centered, gold on deep indigo cosmic starfield"],
  ["libra", "Весы", "Libra zodiac"],
  ["scorpio", "Скорпион", "Scorpio zodiac"],
  ["sagittarius", "Стрелец", "Sagittarius zodiac"],
  ["capricorn", "Козерог", "Capricorn zodiac"],
  ["aquarius", "Водолей", "Aquarius zodiac"],
  ["pisces", "Рыбы", "Pisces zodiac sign: two fish with curved tails (♓), NOT Cancer crab"],
];

/** Sync with src/lib/decks/lenormand.ts — use generate-lenormand-art.mjs for programmatic SVG faces. */
export const LENORMAND = [
  ["rider", "Всадник", "horse rider, news, swift movement"],
  ["clover", "Клевер", "four-leaf clover, luck"],
  ["ship", "Корабль", "sailing ship, journey"],
  ["house", "Дом", "home, family"],
  ["tree", "Дерево", "tree, health, roots"],
  ["clouds", "Тучи", "clouds, uncertainty"],
  ["snake", "Змея", "snake, intrigue"],
  ["coffin", "Гроб", "coffin, ending"],
  ["bouquet", "Букет", "flower bouquet, joy"],
  ["scythe", "Коса", "scythe, sudden cut"],
  ["whip", "Метла", "whip or broom, conflict"],
  ["birds", "Птицы", "pair of birds, conversation"],
  ["child", "Ребёнок", "small child, new beginning"],
  ["fox", "Лиса", "fox, caution"],
  ["bear", "Медведь", "bear, strength, authority"],
  ["stars", "Звёзды", "stars cluster, hope"],
  ["stork", "Аист", "stork bird, change"],
  ["dog", "Собака", "loyal dog, friend"],
  ["tower", "Башня", "tower building, solitude"],
  ["garden", "Сад", "garden gate, society"],
  ["mountain", "Гора", "mountain peak, obstacle"],
  ["crossroads", "Дорога", "crossroads fork, choice"],
  ["mice", "Мыши", "mice, loss, stress"],
  ["heart", "Сердце", "heart, love"],
  ["ring", "Кольцо", "wedding ring, commitment"],
  ["book", "Книга", "closed book, secret knowledge"],
  ["letter", "Письмо", "envelope, message"],
  ["man", "Мужчина", "adult man figure"],
  ["woman", "Женщина", "adult woman figure"],
  ["lily", "Лилия", "lily flower, peace"],
  ["sun", "Солнце", "sun with rays, success"],
  ["moon", "Луна", "crescent moon, intuition"],
  ["key", "Ключ", "old key, solution"],
  ["fish", "Рыбы", "two fish, money, abundance"],
  ["anchor", "Якорь", "ship anchor, stability"],
  ["cross", "Крест", "Christian cross, fate"],
];

const MAJOR = [
  ["the-fool", "Шут"],
  ["the-magician", "Маг"],
  ["the-high-priestess", "Жрица"],
  ["the-empress", "Императрица"],
  ["the-emperor", "Император"],
  ["the-hierophant", "Иерофант"],
  ["the-lovers", "Влюблённые"],
  ["the-chariot", "Колесница"],
  ["strength", "Сила"],
  ["the-hermit", "Отшельник"],
  ["wheel-of-fortune", "Колесо Фортуны"],
  ["justice", "Справедливость"],
  ["the-hanged-man", "Повешенный"],
  ["death", "Смерть"],
  ["temperance", "Умеренность"],
  ["the-devil", "Дьявол"],
  ["the-tower", "Башня"],
  ["the-star", "Звезда"],
  ["the-moon", "Луна"],
  ["the-sun", "Солнце"],
  ["judgement", "Суд"],
  ["the-world", "Мир"],
];

const RANKS = [
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
];

const SUITS = ["cups", "wands", "swords", "pentacles"];

function buildTarotEntries() {
  const out = [...MAJOR.map(([file, name]) => [file, name, name])];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      const rank = RANKS[i];
      const file = `${rank}-of-${suit}`;
      out.push([file, file, file]);
    }
  }
  return out;
}

export const TAROT = buildTarotEntries();

/** Rune download sources (public domain / open) */
export const RUNE_DOWNLOAD = {
  fehu: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Runic_letter_fehu.svg/512px-Runic_letter_fehu.svg.png",
  ],
  uruz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Runic_letter_uruz.svg/512px-Runic_letter_uruz.svg.png",
  ],
  thurisaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Runic_letter_thurisaz.svg/512px-Runic_letter_thurisaz.svg.png",
  ],
  ansuz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Runic_letter_ansuz.svg/512px-Runic_letter_ansuz.svg.png",
  ],
  raido: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Runic_letter_raido.svg/512px-Runic_letter_raido.svg.png",
  ],
  kenaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Runic_letter_kaunan.svg/512px-Runic_letter_kaunan.svg.png",
  ],
  gebo: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Runic_letter_gebo.svg/512px-Runic_letter_gebo.svg.png",
  ],
  wunjo: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Runic_letter_wunjo.svg/512px-Runic_letter_wunjo.svg.png",
  ],
  hagalaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Runic_letter_hagalaz.svg/512px-Runic_letter_hagalaz.svg.png",
  ],
  nauthiz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Runic_letter_naudiz.svg/512px-Runic_letter_naudiz.svg.png",
  ],
  isa: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Runic_letter_isaz.svg/512px-Runic_letter_isaz.svg.png",
  ],
  jera: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Runic_letter_jera.svg/512px-Runic_letter_jera.svg.png",
  ],
  eihwaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Runic_letter_eihwaz.svg/512px-Runic_letter_eihwaz.svg.png",
  ],
  perthro: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Runic_letter_pertho.svg/512px-Runic_letter_pertho.svg.png",
  ],
  algiz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Runic_letter_algiz.svg/512px-Runic_letter_algiz.svg.png",
  ],
  sowilo: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Runic_letter_sowilo.svg/512px-Runic_letter_sowilo.svg.png",
  ],
  tiwaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Runic_letter_tiwaz.svg/512px-Runic_letter_tiwaz.svg.png",
  ],
  berkano: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Runic_letter_berkanan.svg/512px-Runic_letter_berkanan.svg.png",
  ],
  ehwaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Runic_letter_ehwaz.svg/512px-Runic_letter_ehwaz.svg.png",
  ],
  mannaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Runic_letter_mannaz.svg/512px-Runic_letter_mannaz.svg.png",
  ],
  laguz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Runic_letter_laguz.svg/512px-Runic_letter_laguz.svg.png",
  ],
  ingwaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Runic_letter_ingwaz.svg/512px-Runic_letter_ingwaz.svg.png",
  ],
  dagaz: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Runic_letter_dagaz.svg/512px-Runic_letter_dagaz.svg.png",
  ],
  othala: [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Runic_letter_othala.svg/512px-Runic_letter_othala.svg.png",
  ],
};

export const TAROT_DOWNLOAD_BASE =
  "https://raw.githubusercontent.com/dejagwentendu/Tarot-Cards-public/main/";

export const TAROT_SOURCE_FILES = {
  "the-fool": "RWS_Tarot_00_Fool.jpg",
  "the-magician": "RWS_Tarot_01_Magician.jpg",
  "the-high-priestess": "RWS_Tarot_02_High_Priestess.jpg",
  "the-empress": "RWS_Tarot_03_Empress.jpg",
  "the-emperor": "RWS_Tarot_04_Emperor.jpg",
  "the-hierophant": "RWS_Tarot_05_Hierophant.jpg",
  "the-lovers": "RWS_Tarot_06_Lovers.jpg",
  "the-chariot": "RWS_Tarot_07_Chariot.jpg",
  strength: "RWS_Tarot_08_Strength.jpg",
  "the-hermit": "RWS_Tarot_09_Hermit.jpg",
  "wheel-of-fortune": "RWS_Tarot_10_Wheel_of_Fortune.jpg",
  justice: "RWS_Tarot_11_Justice.jpg",
  "the-hanged-man": "RWS_Tarot_12_Hanged_Man.jpg",
  death: "RWS_Tarot_13_Death.jpg",
  temperance: "RWS_Tarot_14_Temperance.jpg",
  "the-devil": "RWS_Tarot_15_Devil.jpg",
  "the-tower": "RWS_Tarot_16_Tower.jpg",
  "the-star": "RWS_Tarot_17_Star (1).jpg",
  "the-moon": "RWS_Tarot_18_Moon.jpg",
  "the-sun": "RWS_Tarot_19_Sun.jpg",
  judgement: "RWS_Tarot_20_Judgement.jpg",
  "the-world": "RWS_Tarot_21_World.jpg",
};

export function tarotMinorSource(file) {
  const m = file.match(/^(ace|two|three|four|five|six|seven|eight|nine|ten|page|knight|queen|king)-of-(cups|wands|swords|pentacles)$/);
  if (!m) return null;
  const rankIdx = RANKS.indexOf(m[1]);
  const suitMap = { cups: "Cups", wands: "Wands", swords: "Swords", pentacles: "Pents" };
  const num = String(rankIdx + 1).padStart(2, "0");
  if (m[2] === "wands" && rankIdx + 1 === 9) return "Tarot_Nine_of_Wands.jpg";
  return `${suitMap[m[2]]}${num}.jpg`;
}

export function deckEntries(system) {
  switch (system) {
    case "runes":
      return RUNES.map(([file, name, hint]) => ({ file, name, hint }));
    case "slavic":
      return SLAVIC.map(([file, name, hint]) => ({ file, name, hint }));
    case "astrology":
      return ASTROLOGY.map(([file, name, hint]) => ({ file, name, hint }));
    case "lenormand":
      return LENORMAND.map(([file, name, hint]) => ({ file, name, hint }));
    case "tarot-veronika":
    case "tarot-marina":
      return TAROT.map(([file, name, hint]) => ({ file, name, hint }));
    default:
      return [];
  }
}
