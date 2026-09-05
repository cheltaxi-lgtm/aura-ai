/** Client-safe vocabulary shared by web/mobile and memory receipts. */
export const MEMORY_PRODUCT_LABELS: Record<string, string> = {
  chat: "Беседа с мастером", reading: "Расклад", intention: "Расклад по намерению",
  photo: "Расклад по фото", daily: "Энергия дня", natal: "Натальная карта",
  hd: "Дизайн человека", matrix: "Матрица судьбы", ritual: "Обряд",
  ritual_review: "Итог обряда", joint: "Совместный расклад", joint_combined: "Совместный расклад",
  palm: "Чтение по ладони", aura: "Чтение ауры", user: "Добавлено вами",
  onboarding: "Знакомство", profile: "Ваш профиль",
  numerology: "Нумерология", spread: "Расклад", human_design: "Дизайн человека",
};
export function memorySourceLabel(source?: string | null): string {
  return MEMORY_PRODUCT_LABELS[source ?? ""] ?? "Обращение к мастеру";
}
export function memoryDisplayDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "";
}
