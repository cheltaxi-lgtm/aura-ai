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
  yearArcana: "Аркан года",
  monthArcana: "Аркан месяца",
  focusZovus: "Аналитический акцент Zovus",
  loveChannel: "Канал отношений",
  moneyChannel: "Денежный канал",
  maleChannel: "Мужская линия рода",
  femaleChannel: "Женская линия рода",
  skyEarthChannel: "Небо — Земля",
} as const;

export function formatAgePeriodLabel(periodStart: number, periodEnd = periodStart + 5): string {
  return `Период ${periodStart}–${periodEnd} лет`;
}
