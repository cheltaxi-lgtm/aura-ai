/** Single glossary for site, PDF, Telegram, prompts. */
export const MATRIX_LABELS = {
  methodologyName: "Матрица судьбы Zovus · система 22 энергий",
  body: "Характер",
  energy: "Небо",
  energyLong: "Небо / энергия",
  roots: "Материя",
  rootsLong: "Материя / год",
  comfort: "Зона комфорта",
  talents: "Таланты",
  relationships: "Отношения",
  money: "Деньги",
  paternal: "Род отца",
  maternal: "Род матери",
  karma: "Кармический хвост · корень",
  karmicMid: "Кармический хвост · середина",
  karmicTip: "Кармический хвост · остриё",
  skySpirit: "Дух",
  earthTask: "Задача",
  maleLine: "Мужская линия",
  femaleLine: "Женская линия",
  agePeriod: "Период возраста",
  ageAndPeriod: "Возраст и текущий период",
  yearArcana: "Аркан года",
  monthArcana: "Аркан месяца",
  focusZovus: "Аналитический акцент Zovus",
  loveChannel: "Канал отношений",
  moneyChannel: "Денежный канал",
  maleChannel: "Мужская линия рода",
  femaleChannel: "Женская линия рода",
  skyEarthChannel: "Небо — Земля",
  purposePersonal: "Личное предназначение",
  purposeSocial: "Социальное предназначение",
  purposeSpiritual: "Духовное предназначение",
  talentPrimary: "Линия талантов · высшая суть",
  talentSecondary: "Линия талантов · дар",
  talentTertiary: "Линия талантов · глубина",
  paternalSpirit: "Род отца · духовное",
  paternalMatter: "Род отца · материальное",
  maternalSpirit: "Род матери · духовное",
  maternalMatter: "Род матери · материальное",
  ageChronological: "Текущий возраст",
  outdatedMethodology: "Предыдущая версия методики",
} as const;

export function formatAgePeriodLabel(periodStart: number, periodEnd = periodStart + 5): string {
  return `Период ${periodStart}–${periodEnd} лет`;
}

export function formatAgeAndPeriodFocus(input: {
  chronological: number;
  periodStart: number;
  periodEnd: number;
}): string {
  return `${MATRIX_LABELS.ageChronological}: ${input.chronological} лет. Период Матрицы: ${input.periodStart}–${input.periodEnd} лет`;
}

/** Client-safe report badge — never leak engine ids like matrix-v5. */
export function clientSafeMatrixVersionLabel(input: {
  currentMethodology: boolean;
  outdatedMethodology: boolean;
}): string {
  if (input.outdatedMethodology) return MATRIX_LABELS.outdatedMethodology;
  if (input.currentMethodology) return MATRIX_LABELS.methodologyName;
  return "Сохранённый разбор";
}

/** Client-safe resolve errors — never leak raw enums. */
export function clientSafeMatrixResolveError(
  error: "unsupported_matrix_version" | "legacy_without_snapshot" | "invalid_birth_date" | string
): string {
  if (error === "legacy_without_snapshot") {
    return "Этот разбор сохранён в старой методике, и схему нельзя восстановить.";
  }
  if (error === "unsupported_matrix_version") {
    return "Этот разбор нельзя открыть: версия методики не поддерживается.";
  }
  if (error === "invalid_birth_date") {
    return "Некорректная дата рождения — схему нельзя показать.";
  }
  return "Не удалось показать сохранённую схему.";
}
