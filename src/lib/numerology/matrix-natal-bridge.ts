/**
 * Natal ↔ destiny-matrix bridge facts for paid readings.
 * Does NOT recalculate arcana — only soft sky overlap lines for the LLM.
 */
import type { NatalChartRecord } from "@/lib/natal/types";
import { bodyFor, signLabel, signName } from "@/lib/natal/presentation";
import { parseBirthDate } from "./constants";
import type { DestinyMatrixResult } from "./destiny-matrix";

export type NatalBridgeInput = {
  sunSign?: string | null;
  moonSign?: string | null;
  ascendantSign?: string | null;
  /** Short house/theme hints already computed by natal stack. */
  themes?: string[] | null;
  hasBirthTime: boolean;
  hasBirthCity: boolean;
};

/** Approximate tropical sun sign from calendar date (no ephemeris). */
export function approximateSunSignFromBirthDate(birthDate: string): string | null {
  const p = parseBirthDate(birthDate);
  if (!p) return null;
  const md = p.month * 100 + p.day;
  if (md >= 321 && md <= 419) return "Овен";
  if (md >= 420 && md <= 520) return "Телец";
  if (md >= 521 && md <= 620) return "Близнецы";
  if (md >= 621 && md <= 722) return "Рак";
  if (md >= 723 && md <= 822) return "Лев";
  if (md >= 823 && md <= 922) return "Дева";
  if (md >= 923 && md <= 1022) return "Весы";
  if (md >= 1023 && md <= 1121) return "Скорпион";
  if (md >= 1122 && md <= 1221) return "Стрелец";
  if (md >= 1222 || md <= 119) return "Козерог";
  if (md >= 120 && md <= 218) return "Водолей";
  if (md >= 219 && md <= 320) return "Рыбы";
  return null;
}

function ruSign(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const labeled = signLabel(raw.trim());
  return labeled || raw.trim();
}

/** Build bridge input from a stored/computed natal chart snapshot. */
export function natalBridgeInputFromChart(
  chart: NatalChartRecord | null | undefined,
  profile: {
    birthDate?: string | null;
    birthTime?: string | null;
    birthCity?: string | null;
  }
): NatalBridgeInput {
  const hasBirthTime = Boolean(profile.birthTime?.trim() || chart?.timeKnown);
  const hasBirthCity = Boolean(profile.birthCity?.trim() || chart?.place?.label);
  const western = chart?.western ?? null;

  let sunSign: string | null = null;
  let moonSign: string | null = null;
  let ascendantSign: string | null = null;
  const themes: string[] = [];

  if (western) {
    sunSign = ruSign(signName(bodyFor(western, "sun")));
    moonSign = ruSign(signName(bodyFor(western, "moon")));
    if (chart?.timeKnown) {
      ascendantSign = ruSign(signName(bodyFor(western, "rising")));
    }
    if (sunSign) themes.push(`Солнце в ${sunSign}`);
    if (moonSign) themes.push(`Луна в ${moonSign}`);
    if (ascendantSign) themes.push(`Асцендент в ${ascendantSign}`);
    if (chart?.place?.label) themes.push(`Место: ${chart.place.label}`);
  }

  if (!sunSign && profile.birthDate) {
    sunSign = approximateSunSignFromBirthDate(profile.birthDate);
    if (sunSign && !themes.length) {
      themes.push(`Солнце в знаке ${sunSign} (приблизительно по дате)`);
    }
  }

  return {
    sunSign,
    moonSign,
    ascendantSign,
    hasBirthTime,
    hasBirthCity,
    themes: themes.length ? themes.slice(0, 4) : null,
  };
}

/** Build bridge input from profile fields + optional birth date for sun approx. */
export function natalBridgeInputFromProfile(profile: {
  birthDate?: string | null;
  birthTime?: string | null;
  birthCity?: string | null;
}): NatalBridgeInput {
  return natalBridgeInputFromChart(null, profile);
}

export type MatrixNatalBridge = {
  available: boolean;
  missing: string[];
  lines: string[];
  cta: string | null;
};

const SIGN_HINTS: Record<string, string> = {
  овен: "инициатива и прямой ход",
  телец: "опора, тело, материя",
  близнецы: "слово, связь, обмен",
  рак: "дом, чувства, род",
  лев: "видимость, сердце, сцена",
  дева: "порядок, служба, детали",
  весы: "партнёрство и баланс",
  скорпион: "глубина, кризис, трансформация",
  стрелец: "смысл, путь, расширение",
  козерог: "структура, долг, статус",
  водолей: "свобода, круг, идея",
  рыбы: "тонкость, образ, растворение",
};

function normSign(raw?: string | null): string {
  return (raw || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z]/gi, "")
    .trim();
}

function signHint(sign?: string | null): string | null {
  const n = normSign(sign);
  if (!n) return null;
  for (const [k, v] of Object.entries(SIGN_HINTS)) {
    if (n.includes(k) || k.includes(n)) return `${sign}: ${v}`;
  }
  return sign ? String(sign) : null;
}

/**
 * Build short bridge lines. Safe when natal data is incomplete.
 */
export function buildMatrixNatalBridgeFacts(
  matrix: DestinyMatrixResult,
  natal: NatalBridgeInput | null | undefined
): MatrixNatalBridge {
  if (!natal) {
    return {
      available: false,
      missing: ["время рождения", "город рождения"],
      lines: [],
      cta: "Добавьте время и город рождения — откроется слой «Небо».",
    };
  }

  const missing: string[] = [];
  if (!natal.hasBirthTime) missing.push("время рождения");
  if (!natal.hasBirthCity) missing.push("город рождения");

  const lines: string[] = [
    "СЛОЙ НЕБО (натал) — не подменяет цифры матрицы, только рифмует темы:",
    `Матрица: комфорт ${matrix.comfort.number}, деньги ${matrix.money.number}, отношения ${matrix.relationships.number}, хвост ${matrix.karmicTail.map((p) => p.number).join("→")}.`,
  ];

  const sun = signHint(natal.sunSign);
  const moon = signHint(natal.moonSign);
  const asc = signHint(natal.ascendantSign);
  if (sun) lines.push(`Солнце — ${sun}. Сверяй с зоной комфорта и характером матрицы.`);
  if (moon) lines.push(`Луна — ${moon}. Сверяй с каналом отношений и родовыми линиями.`);
  if (asc) lines.push(`Асцендент — ${asc}. Сверяй с «визиткой» (характер) и тем, как человек входит в контакт.`);

  const themes = (natal.themes || []).map((t) => t.trim()).filter(Boolean).slice(0, 4);
  if (themes.length) {
    lines.push(`Натальные акценты: ${themes.join("; ")}.`);
  }

  lines.push(
    "В тексте держи блок «Небо» отдельно от расчёта арканов. Цифры матрицы — только из engine."
  );

  const fullSky = missing.length === 0;
  if (!fullSky) {
    lines.push(
      `Небо пока частичное (нет: ${missing.join(", ")}). В разборе отметь CTA дозаполнить профиль.`
    );
  }

  return {
    available: lines.length > 2,
    missing,
    lines,
    cta: fullSky
      ? null
      : `Добавьте в профиль ${missing.join(" и ")} — слой «Небо» станет полнее.`,
  };
}
