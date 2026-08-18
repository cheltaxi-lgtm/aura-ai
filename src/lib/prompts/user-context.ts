import { getAge } from "@/lib/astro-profile";
import { parseCardOrientation } from "@/lib/card-orientation";
import {
  findSymbolByName,
  getDeckPositions,
  type DeckSystem,
} from "@/lib/decks";
import {
  CLIENT_VS_SUBJECT_NAME_RULE,
  isThirdPartyCustomQuestion,
} from "@/lib/custom-question-scope";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import { getSessionTopic } from "@/lib/session-topics";

export type UserContextInput = {
  name: string;
  gender: string | null;
  birth_date: string | null;
  zodiac: string | null;
  age: number | null;
  astro_meta: Record<string, unknown> | null;
};

export type CardContextInput = {
  name: string;
  position: string;
  reversed?: boolean;
  suit?: string;
  arcana?: string;
  keywords?: string[];
};

const SUIT_LABELS: Record<string, string> = {
  cups: "Кубки",
  wands: "Жезлы",
  swords: "Мечи",
  pentacles: "Пентакли",
};

function resolveAge(user: UserContextInput): number | null {
  if (user.age != null && !Number.isNaN(user.age)) return user.age;
  if (user.birth_date) {
    const computed = getAge(user.birth_date);
    if (computed != null) return computed;
  }
  const metaAge = user.astro_meta?.age;
  if (typeof metaAge === "number" && !Number.isNaN(metaAge)) return metaAge;
  return null;
}

export function buildUserContext(user: UserContextInput): string {
  const lines: string[] = [];
  const displayName = normalizePersonDisplayNameOr(user.name, user.name);

  lines.push(`Имя: ${displayName}`);

  if (user.gender) {
    const genderText =
      user.gender === "male"
        ? "мужчина"
        : user.gender === "female"
          ? "женщина"
          : user.gender;
    lines.push(`Пол: ${genderText}`);
  }

  if (user.birth_date) {
    lines.push(`Дата рождения: ${user.birth_date}`);
  }

  const age = resolveAge(user);
  if (age != null) {
    lines.push(`Возраст: ${age} лет`);
  }

  if (user.zodiac) {
    lines.push(`Знак зодиака: ${user.zodiac}`);
  }

  if (user.astro_meta) {
    const meta = user.astro_meta;
    if (meta.rising_sign) lines.push(`Асцендент: ${meta.rising_sign}`);
    if (meta.moon_sign) lines.push(`Луна: ${meta.moon_sign}`);
    if (meta.dominant_planet) lines.push(`Доминирующая планета: ${meta.dominant_planet}`);
    if (meta.chineseZodiac) lines.push(`Китайский знак: ${meta.chineseZodiac}`);
    if (meta.element) lines.push(`Стихия: ${meta.element}`);
    if (meta.lifePath) lines.push(`Число пути: ${meta.lifePath}`);
  }

  return lines.join("\n");
}

export function buildCardsContext(cards: CardContextInput[]): string {
  return cards
    .map((card, i) => {
      const reversedText = card.reversed ? " (перевёрнутая)" : "";
      const arcanaText =
        card.arcana === "major"
          ? "Старший аркан"
          : card.arcana === "minor"
            ? "Младший аркан"
            : card.arcana
              ? String(card.arcana)
              : "Символ";
      const suitText = card.suit ? `, масть: ${SUIT_LABELS[card.suit] ?? card.suit}` : "";
      const keywordsText = card.keywords?.length
        ? `\n   Ключевые слова: ${card.keywords.join(", ")}`
        : "";

      return `Карта ${i + 1} — позиция "${card.position}":
   ${card.name}${reversedText}
   ${arcanaText}${suitText}${keywordsText}`;
    })
    .join("\n\n");
}

export function buildSpreadUserMessage(params: {
  user: UserContextInput;
  cards: CardContextInput[];
  intention?: string | null;
  readingScopeLabel?: string | null;
}): string {
  const intention = params.intention?.trim() || "Общий расклад";
  const scopeSuffix = params.readingScopeLabel?.trim();
  const thirdParty = isThirdPartyCustomQuestion(intention);
  const displayName = normalizePersonDisplayNameOr(params.user.name, params.user.name);

  const taskLines = thirdParty
    ? [
        `Дай подробный расклад по вопросу: «${intention}».`,
        `Обращайся к ${displayName} по имени как к спрашивающему.`,
        CLIENT_VS_SUBJECT_NAME_RULE,
        "Каждая карта описывает субъект из вопроса (другого человека или ситуацию), не внутренний путь клиента.",
        "Не выводи клиенту служебные требования, чеклисты и структуру промпта.",
      ]
    : [
        `Дай подробный персонализированный расклад${scopeSuffix ? ` ${scopeSuffix}` : ""} следуя инструкциям из системного промпта.`,
        "Читай каждую карту/руну по её позиции в раскладе.",
        `Обращайся к ${displayName} по имени.`,
        "Не выводи клиенту служебные требования, чеклисты и структуру промпта.",
      ];

  return `
=== ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ===
${buildUserContext(params.user)}

=== КАРТЫ РАСКЛАДА ===
${buildCardsContext(params.cards)}

=== ВОПРОС / НАМЕРЕНИЕ ===
${intention}${scopeSuffix ? `\nГоризонт прогноза: ${scopeSuffix}` : ""}

=== ТВОЯ ЗАДАЧА ===
${taskLines.join("\n")}
`.trim();
}

export function keywordsFromMeaning(meaning: string): string[] {
  return meaning
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function userContextFromProfile(profile: {
  name: string;
  gender?: string | null;
  birth_date?: string | null;
  birthDate?: string | null;
  zodiac?: string | null;
  astro_meta?: Record<string, unknown> | null;
  astroMeta?: Record<string, unknown> | null;
}): UserContextInput {
  const birthDate = profile.birth_date ?? profile.birthDate ?? null;
  const meta = (profile.astro_meta ?? profile.astroMeta) as Record<string, unknown> | null;
  return {
    name: normalizePersonDisplayNameOr(profile.name, profile.name),
    gender: profile.gender ?? null,
    birth_date: birthDate,
    zodiac: profile.zodiac ?? null,
    age: typeof meta?.age === "number" ? meta.age : null,
    astro_meta: meta,
  };
}

export function enrichCardsForSpreadContext(
  system: DeckSystem,
  cards: { name: string; meaning?: string }[],
  positions?: readonly string[],
  opts?: { omitTextbookMeanings?: boolean }
): CardContextInput[] {
  const pos = positions ?? getDeckPositions(system);
  return cards.map((c, i) => {
    const { reversed } = parseCardOrientation(c.name);
    const sym = findSymbolByName(system, c.name);
    const stripped = c.meaning?.replace(/^[^:]+:\s*/, "").trim() ?? "";
    // Position-only labels ("Ситуация") are not textbook meanings — don't fall back to deck romance glosses.
    const looksLikePositionOnly =
      !stripped ||
      stripped === (pos[i] ?? "") ||
      /^(позиция\s*\d+|ситуация|препятствие|корень|совет|итог|прошлое|настоящее|будущее)$/i.test(
        stripped
      );
    const rawMeaning = opts?.omitTextbookMeanings
      ? ""
      : looksLikePositionOnly
        ? ""
        : stripped || sym?.meaning || "";
    const displayName = sym?.name ?? parseCardOrientation(c.name).name;
    return {
      name: displayName,
      position: pos[i] ?? `Позиция ${i + 1}`,
      reversed,
      suit: sym?.suit,
      arcana: sym?.arcana,
      keywords: keywordsFromMeaning(rawMeaning),
    };
  });
}

export function resolveIntentionLabel(intention?: string | null): string {
  if (!intention?.trim()) return "Общий расклад";
  return getSessionTopic(intention)?.label ?? intention;
}
