import {
  destinyNumber,
  karmicDebts,
  karmicLessons,
  numberOfString,
  personalDay,
  personalMonth,
  personalYear,
  soulNumber,
  personalityNumber,
} from "./calculator";
import { compatibility } from "./compatibility";
import { favorableDates } from "./favorable-dates";
import { personalYearForecast } from "./forecast";
import { fullProfile, type FullNumerologyProfile } from "./profile";
import {
  buildCompatibilityPromptBlock,
  buildObjectNumberPromptBlock,
  formatProfileForPrompt,
} from "./prompt-block";
import { pythagorasSquare, type PythagorasSquareResult } from "./pythagoras-square";
import type { NumerologySystem } from "./constants";
import { parseBirthDate } from "./constants";
import { NUMEROLOG_ANTI_HALLUCINATION_RULE } from "./anti-hallucination";
import {
  extractFullNameFromMessage,
  nameTopicsNeedFullFio,
  resolveNumerologyName,
  type ResolvedNumerologyName,
} from "./name-context";

export type NumerologyTopic =
  | "life_path"
  | "personal_cycle"
  | "karma"
  | "pythagoras_square"
  | "sphere_health"
  | "sphere_finance"
  | "sphere_relations"
  | "forecast_timeline"
  | "favorable_dates"
  | "object_number"
  | "compatibility"
  | "chaldean";

export interface NumerologyChatUi {
  pythagorasSquare?: PythagorasSquareResult;
}

export interface NumerologyChatContextInput {
  birthDate?: string;
  profileName?: string;
  lastUserMessage?: string;
}

export interface NumerologyChatContextResult {
  prompt: string;
  topics: NumerologyTopic[];
  ui?: NumerologyChatUi;
  resolvedName: ResolvedNumerologyName;
}

const TOPIC_PATTERNS: Record<NumerologyTopic, RegExp> = {
  life_path:
    /(?:^|[\s,.!?])(?:расскаж(?:и|ите)|поговор(?:им|ите)|разбер(?:и|ите)|объясни|раскрой|опиши)\s+(?:о\s+|об?\s+)?(?:мо(?:ём|ем|й|и)?\s+)?(?:жизненн(?:ом|ого)\s+)?пут(?:и|ь|ё)|(?:^|[\s,.!?])мо(?:й|ём|ем)\s+пут(?:и|ь|ё)|(?:^|[\s,.!?])числ(?:о|а)\s+(?:жизненного\s+)?пут(?:и|я)|(?:^|[\s,.!?])(?:кто\s+я|что\s+я\s+за\s+человек|расскаж(?:и|ите)\s+обо\s+мне|(?:^|[\s,.!?])обо\s+мне|(?:^|[\s,.!?])про\s+меня|мой\s+характер|мо(?:й|ё|е)\s+предназначен(?:ие|ии)|(?:^|[\s,.!?])призван(?:ие|ии)|м(?:оя|оё|ое)\s+миссия|зачем\s+я\s+здесь)|(?:^|[\s,.!?])что\s+меня\s+жд(?:ё|е)т(?!\s+в\s+этом\s+году)/i,
  personal_cycle:
    /личн(ый|ого|ом|ые|ым)?\s*(год|месяц|день)|этот\s+год|\bсегодня\b|(?:^|[\s,.!?])месяц(?:[\s,.!?]|$)|личн(ый|ого|ом)?\s*месяц|в\s+этом\s+месяце|энерг(ия|ии)\s+дня|что\s+меня\s+жд[ёе]т|жд[ёе]т\s+меня\s+сегодня|цикл\s+года/i,
  karma:
    /карм(а|ический|ические|ического|у)|кarmic|кармическ(ий|ого|ие|их)\s+(долг|урок)|долг\s*(13|14|16|19)?|урок\s*(числ|судьб)|чему\s+(я\s+)?учусь|отсутствующ(ие|их)\s+числ/i,
  pythagoras_square:
    /квадрат\s+пифагора|психоматриц|\bматриц(а|у|ы)\b|матриц(а|у|ы)\s*(судьб|личност|рожден)|сильн(ые|ых)\s+сторон|слаб(ые|ых)\s+сторон|мои\s+цифр|(?:ещё|еще)\s+раз\s+вывед|попробуй.*вывед/i,
  sphere_health:
    /(?:^|[\s,.!?])(?:давай|разбер[её]м|про|по|моё|моё\s+)?(?:с\s+)?здоров(?:ье|ья|ью|и|ьем|ьём)(?:[\s,.!?]|$)|самочувств|иммунитет|болезн|тахикард|аритми|сердц|давлен|гипертон|беспокоит/i,
  sphere_finance:
    /(?:^|[\s,.!?])(?:давай|разбер[её]м|про|по|моё|моё\s+)?(?:с\s+)?(?:финанс(?:ы|ов|ами)?|деньг(?:и|ами|ах)|доход|заработ|материальн)(?:[\s,.!?]|$)/i,
  sphere_relations:
    /(?:^|[\s,.!?])(?:давай|разбер[её]м|про|по|моё|моё\s+)?(?:с\s+)?(?:отношен(?:ия|ии|ий|иями)?|любов(?:ь|и)|пар[ае]|семь[ея]|брак)(?:[\s,.!?]|$)/i,
  forecast_timeline:
    /прогноз\s+на\s+(год|годы|лет)|что\s+будет\s+через|через\s+\d+\s+лет|\bцикл(ы|ов|а)\b|мои\s+цикл|таймлайн|личн(ый|ые)\s+год[ыа]\s+на\s+\d|9\s+лет/i,
  favorable_dates:
    /удачн(ый|ого|ую|ые)\s+день|благоприятн(ая|ые|ую|ой)\s+дат|когда\s+лучше|когда\s+(подпис|начин|запуск|открыв|выход|свадьб|переезд)/i,
  object_number:
    /числ(о|а)\s+(телефон|номер|авто|машин|адрес|квартир|дом|компан|бренд|назван)/i,
  compatibility:
    /совместимост|подход(им|ят)\s+ли|мы\s+с\s+(ним|ней|тобой)|партн[ёе]р|отношен(ия|ии)\s+с|дата\s+рождения\s+(партн|его|её|мужа|жены)/i,
  chaldean:
    /халдейск(ая|ой|ую|ий|ом)|chaldean|по\s+халде/i,
};

const MONTH_NAMES: Record<string, number> = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};

export function detectNumerologyTopics(message: string): NumerologyTopic[] {
  if (!message?.trim()) return [];
  const text = message.toLowerCase();
  const found: NumerologyTopic[] = [];
  for (const [topic, re] of Object.entries(TOPIC_PATTERNS) as [NumerologyTopic, RegExp][]) {
    if (re.test(text)) found.push(topic);
  }

  if (!found.includes("object_number")) {
    if (/\+?\d[\d\s\-()]{8,}/.test(message)) found.push("object_number");
    else if (
      /[а-яёa-z]{2,}/i.test(message) &&
      /(телефон|номер|авто|машин|адрес|гос\.?\s*номер|компан|бренд|назван)/i.test(text)
    ) {
      found.push("object_number");
    }
  }

  if (!found.includes("compatibility") && extractDatesFromMessage(message).length >= 2) {
    if (/он|она|муж|жена|партн|мы|пара|с\s+[а-яё]/i.test(text)) {
      found.push("compatibility");
    }
  }

  return found;
}

function extractDatesFromMessage(message: string): string[] {
  const out: string[] = [];
  const iso = message.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g);
  for (const m of iso) out.push(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);

  const dotted = message.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g);
  for (const m of dotted) {
    out.push(
      `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    );
  }
  return out;
}

function extractObjectString(message: string): { value: string; label: string } | null {
  const phone = message.match(/\+?\d[\d\s\-()]{8,}/);
  if (phone) {
    return { value: phone[0].replace(/\s/g, ""), label: "телефона" };
  }
  if (/авто|машин|гос\.?\s*номер/i.test(message)) {
    const plate = message.match(/[A-ZА-Я]\d{3}[A-ZА-Я]{2}\d{2,3}|\d{2,3}[A-ZА-Я]{2}\d{2,3}/i);
    if (plate) return { value: plate[0], label: "авто/номера" };
  }
  if (/адрес|улиц|дом\s+\d/i.test(message)) {
    const addr = message.match(/(?:адрес|живу|прописан)[:\s—-]+([^\n.!?]{5,80})/i);
    if (addr?.[1]) return { value: addr[1].trim(), label: "адреса" };
  }
  if (/компан|бренд|назван/i.test(message)) {
    const brand = message.match(/(?:компан(?:ия|ии)|бренд|назван(?:ие|ия))[:\s«""—-]+([^»\n.!?]{2,60})/i);
    if (brand?.[1]) return { value: brand[1].trim(), label: "названия" };
  }
  return null;
}

function parseMonthYearFromMessage(message: string): { month?: number; year?: number } {
  const now = new Date();
  let month: number | undefined;
  let year: number | undefined;

  const lower = message.toLowerCase();
  for (const [stem, num] of Object.entries(MONTH_NAMES)) {
    if (lower.includes(stem)) {
      month = num;
      break;
    }
  }

  const yearMatch = message.match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  if (/следующ(ий|ем)\s+месяц/i.test(lower)) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    month = d.getMonth() + 1;
    year = d.getFullYear();
  } else if (/эт(от|ом)\s+месяц/i.test(lower)) {
    month = now.getMonth() + 1;
    year = now.getFullYear();
  }

  return { month, year };
}

function extractPartnerFromMessage(
  message: string,
  userBirthDate: string
): { dateB: string; nameB: string } | null {
  const dates = extractDatesFromMessage(message).filter((d) => d !== userBirthDate);
  const dateB = dates[0];
  if (!dateB) return null;

  let nameB = "партнёр";
  const pair = message.match(
    /(?:я|меня)\s+([а-яёА-ЯЁ-]+)\s+(?:и|с)\s+([а-яёА-ЯЁ-]+)/i
  );
  if (pair?.[2]) nameB = pair[2];
  else {
    const partner = message.match(
      /(?:партн[ёе]р|муж|жена|он|она|любим(?:ый|ая))\s+([а-яёА-ЯЁ-]+(?:\s+[а-яёА-ЯЁ-]+)?)/i
    );
    if (partner?.[1]) nameB = partner[1].trim();
  }

  return { dateB, nameB };
}

function formatBaseProfile(profile: FullNumerologyProfile): string {
  const lines: string[] = [
    "НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ (реальные расчёты — опирайся на числа, не выдумывай):",
    `Система имён: ${profile.system === "pythagorean" ? "пифагорейская" : "халдейская"}.`,
  ];

  if (profile.hasValidName) lines.push(`Имя для расчёта: ${profile.fullName}.`);
  if (profile.hasValidBirthDate) lines.push(`Дата рождения: ${profile.birthDate}.`);

  if (profile.lifePath.number > 0) {
    lines.push(
      `Число жизненного пути: ${profile.lifePath.number}${profile.lifePath.isMaster ? " (мастер)" : ""} — ${profile.lifePath.title}. ${profile.lifePath.meaning}`
    );
  }
  if (profile.destiny.number > 0) {
    lines.push(
      `Число судьбы: ${profile.destiny.number}${profile.destiny.isMaster ? " (мастер)" : ""} — ${profile.destiny.title}.`
    );
  }
  if (profile.soul.number > 0) {
    lines.push(`Число души: ${profile.soul.number} — ${profile.soul.title}.`);
  }
  if (profile.personality.number > 0) {
    lines.push(`Число личности: ${profile.personality.number} — ${profile.personality.title}.`);
  }
  if (profile.birthday.number > 0) {
    lines.push(`Число дня рождения: ${profile.birthday.number}.`);
  }
  if (profile.maturity.number > 0) {
    lines.push(`Число зрелости: ${profile.maturity.number}.`);
  }

  return lines.join("\n");
}

function buildTopicBlock(
  topic: NumerologyTopic,
  ctx: {
    birthDate: string;
    fullName: string;
    message: string;
    system: NumerologySystem;
  }
): { text: string; ui?: NumerologyChatUi } {
  const { birthDate, fullName, message, system } = ctx;
  const now = new Date();

  switch (topic) {
    case "life_path": {
      if (!parseBirthDate(birthDate)) {
        return {
          text: "ЧИСЛО ЖИЗНЕННОГО ПУТИ: нужна дата рождения клиента — попроси её мягко.",
        };
      }
      const profile = fullProfile(birthDate, fullName, system);
      const now = new Date();
      const lines = [
        "ЧИСЛО ЖИЗНЕННОГО ПУТИ (реальный расчёт):",
        `Число пути: ${profile.lifePath.number}${profile.lifePath.isMaster ? " (мастер-число)" : ""} — ${profile.lifePath.title}.`,
        profile.lifePath.meaning,
      ];
      if (profile.lifePath.keywords?.length) {
        lines.push(`Ключевые качества: ${profile.lifePath.keywords.join(", ")}.`);
      }
      if (profile.destiny.number > 0) {
        lines.push(
          `Число судьбы (имя): ${profile.destiny.number}${profile.destiny.isMaster ? " (мастер)" : ""} — ${profile.destiny.title}.`
        );
      }
      if (profile.soul.number > 0) {
        lines.push(`Число души: ${profile.soul.number} — ${profile.soul.title}.`);
      }
      if (profile.personality.number > 0) {
        lines.push(`Число личности: ${profile.personality.number} — ${profile.personality.title}.`);
      }
      if (profile.personalYear.number > 0) {
        lines.push(
          `Личный год ${now.getFullYear()}: ${profile.personalYear.number} — ${profile.personalYear.title}. ${profile.personalYear.meaning.split(".").slice(0, 2).join(".")}.`
        );
      }
      return { text: lines.join("\n") };
    }

    case "personal_cycle": {
      if (!parseBirthDate(birthDate)) {
        return {
          text: "ЛИЧНЫЙ ЦИКЛ: нужна дата рождения клиента — попроси её мягко.",
        };
      }
      const py = personalYear(birthDate);
      const pm = personalMonth(birthDate, now);
      const pd = personalDay(birthDate, now);
      return {
        text: [
          "РАСЧЁТ ЛИЧНОГО ЦИКЛА (реальный):",
          `Личный год ${now.getFullYear()}: ${py.number} — ${py.title}. ${py.meaning}`,
          `Личный месяц (${now.getMonth() + 1}/${now.getFullYear()}): ${pm.number} — ${pm.title}.`,
          `Личный день сегодня: ${pd.number} — ${pd.title}.`,
        ].join("\n"),
      };
    }

    case "karma": {
      const debts = karmicDebts(birthDate, fullName);
      const lessons = karmicLessons(fullName, system);
      return {
        text: [
          "КАРМИЧЕСКИЙ БЛОК (реальный расчёт):",
          debts.length
            ? `Кармические долги: ${debts.join(", ")}.`
            : "Кармические долги 13/14/16/19 в сумме даты и имени не выявлены.",
          lessons.length
            ? `Кармические уроки (нет в имени): ${lessons.join(", ")}.`
            : "Все цифры 1–9 представлены в имени — уроки через отсутствие не выражены.",
        ].join("\n"),
      };
    }

    case "pythagoras_square": {
      if (!parseBirthDate(birthDate)) {
        return { text: "КВАДРАТ ПИФАГОРА: нужна дата рождения." };
      }
      const square = pythagorasSquare(birthDate);
      if (!square) return { text: "КВАДРАТ ПИФАГОРА: не удалось построить по дате." };
      return {
        text: [
          "КВАДРАТ ПИФАГОРА / ПСИХОМАТРИЦА (реальный):",
          `Ячейки: ${Object.entries(square.cells)
            .map(([k, v]) => `${k}→${v}`)
            .join(", ")}.`,
          `Характер (1): ${square.interpretation.character.summary}`,
          `Энергия (2): ${square.interpretation.energy.summary}`,
          `Здоровье (3): ${square.interpretation.health.summary}`,
          `Логика (4): ${square.interpretation.logic.summary}`,
          `Труд (5): ${square.interpretation.labor.summary}`,
          `Удача (6): ${square.interpretation.luck.summary}`,
          `Сильные линии: ${square.lines.rows
            .filter((l) => l.strength >= 3)
            .map((l) => l.label)
            .join("; ") || "умеренные"}.`,
        ].join("\n"),
        ui: { pythagorasSquare: square },
      };
    }

    case "sphere_health":
    case "sphere_finance":
    case "sphere_relations": {
      if (!parseBirthDate(birthDate)) {
        return { text: "СФЕРА: нужна дата рождения для квадрата Пифагора." };
      }
      const square = pythagorasSquare(birthDate);
      if (!square) return { text: "СФЕРА: не удалось построить квадрат." };
      const i = square.interpretation;
      const sphereLabel =
        topic === "sphere_health"
          ? "ЗДОРОВЬЕ"
          : topic === "sphere_finance"
            ? "ФИНАНСЫ"
            : "ОТНОШЕНИЯ";
      const sphereLines =
        topic === "sphere_health"
          ? [
              `Здоровье (3): ${i.health.count} — ${i.health.summary}`,
              `Энергия (2): ${i.energy.count} — ${i.energy.summary}`,
            ]
          : topic === "sphere_finance"
            ? [
                `Труд (5): ${i.labor.count} — ${i.labor.summary}`,
                `Удача (6): ${i.luck.count} — ${i.luck.summary}`,
                `Логика (4): ${i.logic.count} — ${i.logic.summary}`,
              ]
            : [
                `Энергия (2): ${i.energy.count} — ${i.energy.summary}`,
                `Характер (1): ${i.character.count} — ${i.character.summary}`,
                `Удача (6): ${i.luck.count} — ${i.luck.summary}`,
              ];
      return {
        text: [`СФЕРА ${sphereLabel} (квадрат Пифагора, реальный):`, ...sphereLines].join("\n"),
        ui: { pythagorasSquare: square },
      };
    }

    case "forecast_timeline": {
      if (!parseBirthDate(birthDate)) {
        return { text: "ПРОГНОЗ 9 ЛЕТ: нужна дата рождения." };
      }
      const startYear = now.getFullYear();
      const forecast = personalYearForecast(birthDate, startYear, 9);
      const compact = forecast
        .map((y) => `${y.year}: ${y.number} (${y.theme})`)
        .join("; ");
      return {
        text: `ПРОГНОЗ ЛИЧНЫХ ГОДОВ на 9 лет от ${startYear} (реальный): ${compact}.`,
      };
    }

    case "favorable_dates": {
      if (!parseBirthDate(birthDate)) {
        return { text: "БЛАГОПРИЯТНЫЕ ДАТЫ: нужна дата рождения." };
      }
      const { month, year } = parseMonthYearFromMessage(message);
      const refMonth = month ?? now.getMonth() + 1;
      const refYear = year ?? now.getFullYear();
      const fav = favorableDates(birthDate, refMonth, refYear);
      if (!fav) return { text: "БЛАГОПРИЯТНЫЕ ДАТЫ: не удалось рассчитать." };
      return {
        text: [
          `БЛАГОПРИЯТНЫЕ ДАТЫ (${refMonth}/${refYear}, реальный расчёт):`,
          `Удачные дни: ${fav.favorable.slice(0, 14).join(", ") || "уточни запрос"}.`,
          `Нейтральные: ${fav.neutral.slice(0, 8).join(", ") || "—"}.`,
          `Осторожность: ${fav.caution.slice(0, 10).join(", ") || "нет выраженных"}.`,
        ].join("\n"),
      };
    }

    case "object_number": {
      const obj = extractObjectString(message);
      if (!obj) {
        return {
          text: "ЧИСЛО ОБЪЕКТА: попроси телефон, номер авто, адрес или название — посчитаешь число.",
        };
      }
      return { text: buildObjectNumberPromptBlock(obj.value, obj.label) };
    }

    case "compatibility": {
      if (!parseBirthDate(birthDate)) {
        return {
          text: "СОВМЕСТИМОСТЬ: нужна твоя дата рождения. Попроси также дату (и имя) партнёра.",
        };
      }
      const partner = extractPartnerFromMessage(message, birthDate);
      if (!partner) {
        return {
          text: "СОВМЕСТИМОСТЬ: попроси дату рождения партнёра (и имя, если можно) — тогда дашь score 0–100.",
        };
      }
      const nameA = fullName.split(/\s+/)[0] || fullName || "клиент";
      return {
        text: buildCompatibilityPromptBlock(
          birthDate,
          nameA,
          partner.dateB,
          partner.nameB
        ),
      };
    }

    case "chaldean": {
      if (!fullName.trim()) {
        return {
          text: "ХАЛДЕЙСКИЙ РАСЧЁТ: нужно полное ФИО — попроси его для точного числа судьбы.",
        };
      }
      const dest = destinyNumber(fullName, "chaldean");
      const soul = soulNumber(fullName, "chaldean");
      const pers = personalityNumber(fullName, "chaldean");
      return {
        text: [
          "ХАЛДЕЙСКАЯ СИСТЕМА (реальный пересчёт имён):",
          `Число судьбы: ${dest.number}${dest.isMaster ? " (мастер)" : ""} — ${dest.title}. ${dest.meaning}`,
          `Число души: ${soul.number} — ${soul.title}.`,
          `Число личности: ${pers.number} — ${pers.title}.`,
        ].join("\n"),
      };
    }

    default:
      return { text: "" };
  }
}

/** Build numerology prompt: base portrait + topic-triggered calculation blocks only. */
export function buildNumerologyChatContext(
  input: NumerologyChatContextInput
): NumerologyChatContextResult {
  const message = input.lastUserMessage?.trim() ?? "";
  const resolvedName = resolveNumerologyName(input.profileName, message);
  const topics = detectNumerologyTopics(message);
  const system: NumerologySystem = topics.includes("chaldean")
    ? "chaldean"
    : "pythagorean";

  const birthDate = input.birthDate?.trim() ?? "";
  const hasBirth = Boolean(parseBirthDate(birthDate));
  const hasName = Boolean(resolvedName.fullName.trim());

  const parts: string[] = [];

  if (!hasBirth && !hasName) {
    parts.push(
      "НУМЕРОЛОГИЧЕСКИЙ КОНТЕКСТ:",
      "Дата рождения и имя не переданы. Мягко попроси дату рождения (и полное ФИО для расчёта судьбы).",
      "Можешь предложить: личный год, квадрат Пифагора, прогноз на 9 лет, совместимость, удачные даты, число телефона."
    );
    return { prompt: parts.join("\n"), topics, resolvedName };
  }

  const profile = fullProfile(birthDate, resolvedName.fullName, system);
  parts.push(formatBaseProfile(profile));

  if (resolvedName.needsFullFio && nameTopicsNeedFullFio(topics)) {
    parts.push(
      "ПОЛНОТА ФИО: для точного расчёта по имени нужно полное ФИО (минимум имя и фамилия). Попроси мягко; если клиент назвал ФИО в сообщении — используй его."
    );
  } else if (resolvedName.fromMessage) {
    parts.push(`ФИО из сообщения клиента: ${resolvedName.fullName}.`);
  }

  let ui: NumerologyChatUi | undefined;

  for (const topic of topics) {
    const block = buildTopicBlock(topic, {
      birthDate,
      fullName: resolvedName.fullName,
      message,
      system,
    });
    if (block.text) parts.push(block.text);
    if (block.ui?.pythagorasSquare) {
      ui = { ...ui, pythagorasSquare: block.ui.pythagorasSquare };
    }
  }

  if (topics.length === 0 && hasBirth) {
    parts.push(
      "ПОДСКАЗКА МАСТЕРУ: клиент может спросить про личный год/месяц/день, карму, квадрат Пифагора, прогноз на 9 лет, удачные даты, число телефона/адреса, совместимость или халдейскую систему — предложи при уместности."
    );
  }

  parts.push(NUMEROLOG_ANTI_HALLUCINATION_RULE);

  return { prompt: parts.join("\n\n"), topics, ui, resolvedName };
}

/** @deprecated use buildNumerologyChatContext — kept for reading routes. */
export function buildNumerologyPromptBlock(
  birthDate: string | undefined,
  fullName: string | undefined,
  lastUserMessage?: string
): string {
  return buildNumerologyChatContext({
    birthDate,
    profileName: fullName,
    lastUserMessage,
  }).prompt;
}

