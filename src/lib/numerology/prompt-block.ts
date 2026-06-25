import { compatibility } from "./compatibility";

import { fullProfile, type FullNumerologyProfile } from "./profile";

import { numberOfString } from "./calculator";

import type { NumerologySystem } from "./constants";



export { buildNumerologyChatContext, buildNumerologyPromptBlock, detectNumerologyTopics } from "./topic-handlers";

export type { NumerologyChatContextResult, NumerologyChatUi, NumerologyTopic } from "./topic-handlers";

export { extractFullNameFromMessage, resolveNumerologyName } from "./name-context";



/** @deprecated Prefer buildNumerologyChatContext — full profile formatter for legacy use. */

export function formatProfileForPrompt(profile: FullNumerologyProfile): string {

  const lines: string[] = [

    "НУМЕРОЛОГИЧЕСКИЙ КОНТЕКСТ (РЕАЛЬНЫЕ РАСЧЁТЫ — опирайся на эти числа, не выдумывай):",

    `Система имён: ${profile.system === "pythagorean" ? "пифагорейская" : "халдейская"}.`,

  ];



  if (profile.hasValidName) {

    lines.push(`Имя для расчёта: ${profile.fullName}.`);

  }

  if (profile.hasValidBirthDate) {

    lines.push(`Дата рождения: ${profile.birthDate}.`);

  }



  if (profile.lifePath.number > 0) {

    lines.push(

      `Число жизненного пути: ${profile.lifePath.number}${profile.lifePath.isMaster ? " (мастер)" : ""} — ${profile.lifePath.title}. ${profile.lifePath.meaning}`

    );

  }

  if (profile.destiny.number > 0) {

    lines.push(

      `Число судьбы (имя): ${profile.destiny.number}${profile.destiny.isMaster ? " (мастер)" : ""} — ${profile.destiny.title}.`

    );

  }

  if (profile.soul.number > 0) {

    lines.push(`Число души (гласные): ${profile.soul.number} — ${profile.soul.title}.`);

  }

  if (profile.personality.number > 0) {

    lines.push(`Число личности (согласные): ${profile.personality.number} — ${profile.personality.title}.`);

  }

  if (profile.birthday.number > 0) {

    lines.push(`Число дня рождения: ${profile.birthday.number}.`);

  }

  if (profile.maturity.number > 0) {

    lines.push(`Число зрелости: ${profile.maturity.number}.`);

  }



  return lines.join("\n");

}



export function buildCompatibilityPromptBlock(

  dateA: string,

  nameA: string,

  dateB: string,

  nameB: string

): string {

  const result = compatibility(dateA, nameA, dateB, nameB);

  return [

    "РАСЧЁТ СОВМЕСТИМОСТИ (реальный):",

    `Оценка: ${result.score} из 100.`,

    result.lifePathMatch,

    result.destinyMatch,

    `Сильные стороны: ${result.strengths.join(" ")}`,

    `Риски: ${result.risks.join(" ")}`,

    result.summary,

  ].join("\n");

}



export function buildObjectNumberPromptBlock(value: string, label = "объект"): string {

  const result = numberOfString(value);

  if (result.number <= 0) {

    return `Число ${label} «${value}» не удалось рассчитать — уточни формат.`;

  }

  return `Число ${label} «${value}»: ${result.number}${result.isMaster ? " (мастер)" : ""} — ${result.title}. ${result.meaning}`;

}



export { fullProfile, type FullNumerologyProfile };

export type { NumerologySystem };


