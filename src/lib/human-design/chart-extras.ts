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

/** Owner-only: arrows derive from Tone, not Color. Design Sun/Earth gives
 * determination, Design Nodes environment, Personality Nodes perspective,
 * and Personality Sun/Earth motivation. Unknown-time charts cannot establish
 * these small cells; callers must present them as unavailable. */
export function variableSummary(chart: HdChart): {
  personalitySun: HdActivation;
  designSun: HdActivation;
  variables: Array<{ key: string; label: string; source: string; activation: HdActivation; direction: "left" | "right" }>;
  cognitionHint: string;
  environmentHint: string;
} {
  const activation = (side: HdActivation[], body: string) => {
    const found = findBody(side, body) as HdActivation | undefined;
    if (!found || !Number.isInteger(found.tone) || found.tone < 1 || found.tone > 6) throw new Error("HD_VARIABLE_ACTIVATION_MISSING");
    return found;
  };
  const p = activation(chart.personality, "sun"), d = activation(chart.designActivations, "sun");
  const variables = [
    { key: "determination", label: "Усвоение", source: "Дизайн · Солнце/Земля", activation: d },
    { key: "environment", label: "Среда", source: "Дизайн · лунные узлы", activation: activation(chart.designActivations, "northNode") },
    { key: "perspective", label: "Перспектива", source: "Личность · лунные узлы", activation: activation(chart.personality, "northNode") },
    { key: "motivation", label: "Мотивация", source: "Личность · Солнце/Земля", activation: p },
  ].map(v => ({ ...v, direction: v.activation.tone <= 3 ? "left" as const : "right" as const }));
  return {
    personalitySun: p,
    designSun: d,
    variables,
    cognitionHint: `Мотивация: стрелка ${variables[3]!.direction === "left" ? "влево" : "вправо"}, тон ${p.tone}.`,
    environmentHint: `Среда: стрелка ${variables[1]!.direction === "left" ? "влево" : "вправо"}, тон ${variables[1]!.activation.tone}.`,
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
    chart.timeKnown ? "Переменные: направление по тону 1–3 влево, 4–6 вправо." : "Время рождения неизвестно: Variables, color/tone/base и точная среда не определены. Не выдавай условные малые ячейки за персональные характеристики."
  );
  if (!chart.timeKnown) return lines.join("\n");
  for (const item of v.variables) lines.push(`${item.label} (${item.source}): ${item.activation.gate}.${item.activation.line}, цвет ${item.activation.color}, тон ${item.activation.tone}, направление ${item.direction === "left" ? "влево" : "вправо"}.`);
  lines.push(`Подсказка мотивации: ${v.cognitionHint}`);
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
