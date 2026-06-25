import { fullProfile } from "@/lib/numerology/profile";
import { personalYearTheme } from "@/lib/numerology/forecast";
import { NUMEROLOGY_SPREAD_POSITIONS } from "@/lib/decks";

export const NUMEROLOG_MASTER_ID = "numerolog" as const;

export function isNumerologMaster(
  masterId: string | null | undefined
): masterId is typeof NUMEROLOG_MASTER_ID {
  return masterId === NUMEROLOG_MASTER_ID;
}

const PROFILE_STORAGE_KEY = "aura_profile";

/** Client-only profile name for numerolog welcome (avoids HomePage prop wiring). */
export function readStoredProfileForWelcome(): { name: string; birthDate: string } {
  if (typeof window === "undefined") return { name: "", birthDate: "" };
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { name: "", birthDate: "" };
    const data = JSON.parse(raw) as { name?: string; birthDate?: string };
    return {
      name: typeof data.name === "string" ? data.name.trim() : "",
      birthDate: typeof data.birthDate === "string" ? data.birthDate.trim() : "",
    };
  } catch {
    return { name: "", birthDate: "" };
  }
}

function spreadNumberLine(
  position: string,
  num: string,
  profile: ReturnType<typeof fullProfile>
): string {
  const n = parseInt(num, 10);
  const theme = Number.isFinite(n) ? personalYearTheme(n) : "";
  const lp = profile.lifePath.number;
  const py = profile.personalYear.number;

  let link = "";
  if (position.includes("пути") && lp > 0) {
    link = ` Рядом с числом пути **${lp}**.`;
  } else if (position.includes("периода") && py > 0) {
    link = ` Перекликается с личным годом **${py}**.`;
  } else if (position.includes("Совет")) {
    link = " Практический вектор — что делать, не меняя базовую карту.";
  }

  return `**${position} — ${num}:** ${theme || "энергия момента"}.${link}`;
}

export function buildNumerologWelcomeMessage(input: {
  userName: string;
  birthDate?: string;
  fullName?: string;
  spreadNumbers?: string[];
}): string {
  const name = input.userName.trim() || "друг";
  const profile = fullProfile(input.birthDate ?? "", input.fullName ?? name);

  const lines: string[] = [`${name}, рада тебя видеть.`, ""];

  if (profile.hasValidBirthDate && profile.lifePath.number > 0) {
    const lp = profile.lifePath;
    const masterNote = lp.isMaster ? " (мастер-число)" : "";
    lines.push(
      `Твоё число жизненного пути — ${lp.number}${masterNote}. ${lp.title}.`,
      lp.meaning.split(".")[0]?.trim() ? `${lp.meaning.split(".")[0]?.trim()}.` : lp.meaning,
      ""
    );
  } else {
    lines.push("Назови дату рождения — посчитаю твой код судьбы.", "");
  }

  if (input.spreadNumbers?.length === 3) {
    lines.push(
      `Три числа расклада: ${input.spreadNumbers.join(" · ")} — путь, энергия периода и совет.`,
      ""
    );
  }

  lines.push(
    "Выбери расчёт кнопками под полем ввода или напиши свой вопрос — отдельную «тему» выбирать не нужно."
  );

  return lines.join("\n");
}

/** Opening reading: only the 3-card spread + brief context — NOT full Pythagoras matrix. */
export function buildNumerologSpreadReading(input: {
  userName: string;
  birthDate?: string;
  fullName?: string;
  spreadNumbers: string[];
}): string {
  const cards = input.spreadNumbers.slice(0, 3);
  const firstName =
    input.userName.trim().split(/\s+/)[0] || input.userName.trim() || "друг";
  const profile = fullProfile(input.birthDate ?? "", input.fullName ?? input.userName);

  if (cards.length < 3) {
    return buildNumerologWelcomeMessage({
      userName: input.userName,
      birthDate: input.birthDate,
      fullName: input.fullName,
      spreadNumbers: cards,
    });
  }

  const positions = NUMEROLOGY_SPREAD_POSITIONS;

  const lines = [
    `${firstName}, три числа выпали: **${cards.join(" · ")}**. Это **акцент периода** — не «другая судьба», а подсказка на ближайшее время.`,
    "",
    "## Три позиции расклада",
    "",
    spreadNumberLine(positions[0]!, cards[0]!, profile),
    "",
    spreadNumberLine(positions[1]!, cards[1]!, profile),
    "",
    spreadNumberLine(positions[2]!, cards[2]!, profile),
  ];

  if (profile.hasValidBirthDate) {
    lines.push(
      "",
      "## Контекст по дате рождения",
      "",
      profile.lifePath.number > 0
        ? `**Число пути:** ${profile.lifePath.number} — ${profile.lifePath.title}.`
        : "",
      profile.personalYear.number > 0
        ? `**Личный год ${new Date().getFullYear()}:** ${profile.personalYear.number} — ${profile.personalYear.title}.`
        : "",
      "",
      "Полный **квадрат Пифагора** с сеткой — по кнопке «Квадрат Пифагора» или если попросишь отдельно."
    );
  } else {
    lines.push("", "Назови **дату рождения** — тогда свяжу расклад с числом пути и личным годом.");
  }

  return lines.filter(Boolean).join("\n");
}

/** Fallback finale when LLM is unavailable (client/server). */
export function buildSpreadOpeningFinale(firstName: string, spreadNumbers: string[]): string {
  const cards = spreadNumbers.slice(0, 3);
  const path = parseInt(cards[0] ?? "", 10);
  const period = parseInt(cards[1] ?? "", 10);
  const advice = parseInt(cards[2] ?? "", 10);

  const parts: string[] = [];

  if (Number.isFinite(path)) {
    const theme = personalYearTheme(path).toLowerCase();
    parts.push(`Сейчас у тебя ${theme} (${path}) — опирайся на эту линию в решениях.`);
  }
  if (Number.isFinite(period)) {
    const theme = personalYearTheme(period).toLowerCase();
    parts.push(`Ближайший период про ${theme} (${period}) — не форсируй то, что требует терпения.`);
  }
  if (Number.isFinite(advice)) {
    const theme = personalYearTheme(advice).toLowerCase();
    parts.push(`Совет чисел — двигаться через ${theme} (${advice}), не ломая то, что уже работает.`);
  }

  if (parts.length === 0) {
    return `${firstName}, три числа — акцент ближайшего периода, не «новая судьба». Опирайся на них в решениях, а полный квадрат Пифагора можно запросить отдельно.`;
  }

  return parts.join(" ");
}

const GENERIC_SESSION_ONLY_RE =
  /готов к сеансу\.?\s*Задайте свой вопрос/i;

export function resolveNumerologAssistantDisplayContent(
  masterId: string,
  role: string,
  content: string,
  userBirthDate?: string
): string {
  if (!isNumerologMaster(masterId) || role !== "assistant") return content;
  if (GENERIC_SESSION_ONLY_RE.test(content)) {
    const stored = readStoredProfileForWelcome();
    return buildNumerologWelcomeMessage({
      userName: stored.name || "друг",
      birthDate: userBirthDate || stored.birthDate,
      fullName: stored.name,
    });
  }
  return content;
}
