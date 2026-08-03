import type { NumerologToolId } from "./tools";
import { getNumerologTool } from "./tools";

export function getNumerologSessionCopy(
  toolId: NumerologToolId,
  options?: { hasBirthDate?: boolean; hasFullName?: boolean }
): {
  ritualTitle: string;
  ritualBody: string;
  computingHint: string;
  revealHint: string;
  personalNote: string;
} {
  const tool = getNumerologTool(toolId);
  const birthHint = options?.hasBirthDate
    ? "Сверяю расчёт с вашей датой рождения."
    : "Нужна дата рождения для точного кода.";
  const nameHint = options?.hasFullName ? "Учитываю полное имя." : "";

  if (tool.drawCount === 0) {
    return {
      ritualTitle: tool.label,
      ritualBody: `${birthHint} ${nameHint} Строю психоматрицу — это чистая математика даты, без случайности.`.trim(),
      computingHint: "Считаем квадрат Пифагора…",
      revealHint: "Ваша матрица готова — изучите ячейки и начните сеанс.",
      personalNote: "Пифагорейский расчёт · без случайного вытягивания",
    };
  }

  const count = tool.drawCount;
  const countWord =
    count === 1 ? "число" : count < 5 ? "числа" : "чисел";

  return {
    ritualTitle: tool.label,
    ritualBody: `${birthHint} ${nameHint} Сейчас посчитаю ${count} ${countWord} по классической нумерологии — не «вытягивание», а расчёт из вашего кода.`.trim(),
    computingHint: "Считаем ваш нумерологический код…",
    revealHint: `Расчёт готов — ${count === 1 ? "число" : "числа"} прояв${count === 1 ? "ится" : "ятся"} по позициям.`,
    personalNote: "Детерминированный расчёт · не расклад карт",
  };
}
