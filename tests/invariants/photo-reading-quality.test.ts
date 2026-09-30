import { describe, expect, it } from "vitest";
import {
  hasPhotoInterpretationDepth,
  normalizePhotoInterpretation,
} from "@/lib/photo-reading-stream";

describe("paid photo interpretation quality", () => {
  const summary = "Подтверждённые символы (1):\n1. Суть вопроса: «Шут» — новое начало";

  it("removes malformed markdown before delivery and persistence", () => {
    expect(normalizePhotoInterpretation("## **Шут**\n\n***Новый путь***"))
      .toBe("Шут\n\nНовый путь");
  });

  it("requires a complete, card-grounded answer", () => {
    const full = `Шут здесь говорит о начале нового этапа. Решение пока не созрело, но первый шаг уже виден в вопросе. ${"Дайте себе время проверить направление. ".repeat(3)}\n\nШут в позиции «Суть вопроса» показывает выбор без готовой карты пути. ${"Не подменяйте реальный опыт обещанием результата. ".repeat(3)}`;
    expect(hasPhotoInterpretationDepth(full, 1, summary)).toBe(true);
    expect(hasPhotoInterpretationDepth(full.replaceAll("Шут", "символ"), 1, summary)).toBe(false);
    expect(hasPhotoInterpretationDepth("Шут.\n\nВсё будет хорошо.", 1, summary)).toBe(false);
  });

  it("does not accept a generic four-paragraph answer for twelve cards", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Карта${i + 1}`);
    const longSummary = names.map((name, i) => `${i + 1}. Позиция ${i + 1}: «${name}»`).join("\n");
    const generic = Array.from({ length: 4 }, () => names.join(", ") + ". Это общий вывод без разбора каждой позиции. ".repeat(12)).join("\n\n");
    expect(hasPhotoInterpretationDepth(generic, 12, longSummary)).toBe(false);
  });

  it("requires each same-suit card in its own substantive paragraph", () => {
    const sameSuit = ["Туз Кубков", "Двойка Кубков", "Тройка Кубков"];
    const summary = sameSuit.map((name, i) => `${i + 1}. Позиция ${i + 1}: «${name}»`).join("\n");
    const generic = Array.from({ length: 4 }, () =>
      `Кубков — общая тема эмоций. ${"Эта масть говорит о чувствах без разбора конкретной позиции. ".repeat(5)}`
    ).join("\n\n");
    expect(hasPhotoInterpretationDepth(generic, 3, summary)).toBe(false);
    const detailed = sameSuit.map((name, i) =>
      `${name} в позиции ${i + 1} означает отдельный шаг в истории клиента. ${"Здесь нужно сопоставить символ с вопросом и обстоятельствами. ".repeat(3)}`
    ).join("\n\n") + `\n\nОбщий вывод связывает все позиции и подсказывает, что проверить дальше. ${"Решение остаётся за клиентом. ".repeat(4)}`;
    expect(hasPhotoInterpretationDepth(detailed, 3, summary)).toBe(true);
  });

  it("does not confuse Суд with Судьба", () => {
    const summary = "1. Позиция 1: «Суд»";
    const generic = Array.from({ length: 2 }, () =>
      `Судьба кажется предрешённой, но это общий текст без разбора карты. ${"У клиента остаётся выбор и ответственность за него. ".repeat(5)}`
    ).join("\n\n");
    expect(hasPhotoInterpretationDepth(generic, 1, summary)).toBe(false);
  });
});
