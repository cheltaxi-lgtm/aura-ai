import type { HdActivation, HdChart, HdPublicActivation, HdPublicChart } from "./types";
import { CHANNELS, GATE_NAMES_RU } from "./constants";

/** Gates that sit in an incomplete channel (classic «висящие»). */
export function hangingGates(chart: HdChart | HdPublicChart): number[] {
  const active = new Set(chart.activeGates);
  const hanging = new Set<number>();
  for (const ch of CHANNELS) {
    const [a, b] = ch.gates;
    const hasA = active.has(a);
    const hasB = active.has(b);
    if (hasA && !hasB) hanging.add(a);
    if (hasB && !hasA) hanging.add(b);
  }
  return [...hanging].sort((x, y) => x - y);
}

/** Gates only in Design (unconscious) or only in Personality (conscious). */
export function splitCardGates(chart: HdChart | HdPublicChart): {
  personalityOnly: number[];
  designOnly: number[];
  both: number[];
} {
  const p = new Set(chart.personality.map((a) => a.gate));
  const d = new Set(chart.designActivations.map((a) => a.gate));
  const personalityOnly: number[] = [];
  const designOnly: number[] = [];
  const both: number[] = [];
  for (const g of chart.activeGates) {
    const inP = p.has(g);
    const inD = d.has(g);
    if (inP && inD) both.push(g);
    else if (inP) personalityOnly.push(g);
    else designOnly.push(g);
  }
  return { personalityOnly, designOnly, both };
}

function findBody(
  list: (HdActivation | HdPublicActivation)[],
  body: string
): (HdActivation | HdPublicActivation) | undefined {
  return list.find((a) => a.body === body);
}

/**
 * Simplified Variable arrows from Sun color (1–3 left / 4–6 right) —
 * enough for product UI without claiming full PHS certification language.
 */
/** Owner-only: needs color/tone/base (stripped from public share payloads). */
export function variableSummary(chart: HdChart): {
  personalitySun: { gate: number; line: number; color: number; tone: number; base: number };
  designSun: { gate: number; line: number; color: number; tone: number; base: number };
  cognitionHint: string;
  environmentHint: string;
} {
  const pSun = findBody(chart.personality, "sun") as HdActivation | undefined;
  const dSun = findBody(chart.designActivations, "sun") as HdActivation | undefined;
  const p = {
    gate: pSun?.gate ?? 0,
    line: pSun?.line ?? 0,
    color: pSun?.color ?? 1,
    tone: pSun?.tone ?? 1,
    base: pSun?.base ?? 1,
  };
  const d = {
    gate: dSun?.gate ?? 0,
    line: dSun?.line ?? 0,
    color: dSun?.color ?? 1,
    tone: dSun?.tone ?? 1,
    base: dSun?.base ?? 1,
  };
  const pLeft = p.color <= 3;
  const dLeft = d.color <= 3;
  return {
    personalitySun: p,
    designSun: d,
    cognitionHint: pLeft
      ? "Сознательная стрелка чаще «влево»: опора на активное исследование и стратегию."
      : "Сознательная стрелка чаще «вправо»: опора на восприятие и ожидание правильного момента.",
    environmentHint: dLeft
      ? "Бессознательная стрелка чаще «влево»: телу комфортнее в более активной, стимулирующей среде."
      : "Бессознательная стрелка чаще «вправо»: телу комфортнее в спокойной, поддерживающей среде.",
  };
}

export function formatExtrasForEvidence(chart: HdChart): string {
  const hang = hangingGates(chart);
  const split = splitCardGates(chart);
  const v = variableSummary(chart);
  const lines: string[] = [];
  lines.push("");
  lines.push("ДОПОЛНИТЕЛЬНАЯ МЕХАНИКА (для полного разбора):");
  lines.push(
    `Висящие ворота (без полного канала): ${
      hang.length ? hang.map((g) => `${g} «${GATE_NAMES_RU[g] ?? ""}»`).join(", ") : "нет"
    }`
  );
  lines.push(
    `Только Личность: ${split.personalityOnly.join(", ") || "нет"} · Только Дизайн: ${split.designOnly.join(", ") || "нет"} · Оба: ${split.both.length}`
  );
  lines.push(
    `Переменные (упрощённо по цвету Солнца): Личность ${v.personalitySun.gate}.${v.personalitySun.line} цвет ${v.personalitySun.color}/тон ${v.personalitySun.tone}/база ${v.personalitySun.base}; Дизайн ${v.designSun.gate}.${v.designSun.line} цвет ${v.designSun.color}/тон ${v.designSun.tone}/база ${v.designSun.base}`
  );
  lines.push(`Подсказка познания: ${v.cognitionHint}`);
  lines.push(`Подсказка среды: ${v.environmentHint}`);
  lines.push(
    "Активации с color/tone/base (Личность):"
  );
  for (const a of chart.personality) {
    lines.push(
      `- ${a.body}: ${a.gate}.${a.line}.${a.color}.${a.tone}.${a.base} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    );
  }
  lines.push("Активации с color/tone/base (Дизайн):");
  for (const a of chart.designActivations) {
    lines.push(
      `- ${a.body}: ${a.gate}.${a.line}.${a.color}.${a.tone}.${a.base} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    );
  }
  return lines.join("\n");
}

export type HdReportTone = "personal" | "child" | "work";

export function reportTonePromptHint(tone: HdReportTone): string {
  switch (tone) {
    case "child":
      return "Тон: разбор для родителя о ребёнке. Без романтизации, с фокусом на воспитание, безопасность, ритм, школу/игру и уважение к стратегии ребёнка. Обращайся к родителю на «вы», о ребёнке — по имени если дано.";
    case "work":
      return "Тон: карьера и работа. Фокус на решениях, роли в команде, лидерстве, деньгах как энергии обмена, выгорании и правильной стратегии на работе. Без медицинских советов.";
    default:
      return "Тон: личный полный разбор для взрослого — жизнь, отношения, энергия, решения.";
  }
}
