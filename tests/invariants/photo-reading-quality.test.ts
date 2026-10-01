import { describe, expect, it } from "vitest";
import {
  hasPhotoInterpretationDepth,
  normalizePhotoInterpretation,
} from "@/lib/photo-reading-stream";
import { assessPhotoInterpretation } from "@/lib/photo-reading-quality";
import { photoInterpretationMaxTokens } from "@/lib/photo-reading-prompts";
import { resolveAuraArtForDetected } from "@/lib/photo-card-resolve";
import { buildPartialRedrawSpread, buildSpreadSummaryForLlm } from "@/lib/photo-spread-redraw";

describe("paid photo interpretation quality", () => {
  const paragraph = (name: string) => `${name}: эта позиция раскрывает отдельную сторону вопроса. ${"Сопоставь её значение с обстоятельствами и проверь следующий практический шаг. ".repeat(2)}`;
  const conclusion = paragraph("Общий вывод");
  const summaryFor = (names: string[]) => names.map((name, i) => `${i + 1}. Позиция ${i + 1}: «${name}»`).join("\n");
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

  it.each(["Жезлов", "Кубков", "Мечей", "Пентаклей"])("accepts all numeric/word ranks and inflections for %s", (suit) => {
    const ranks = ["Двойки", "Тройки", "Четвёрки", "Пятёрки", "Шестёрки", "Семёрки", "Восьмёрки", "Девятки", "Десятки"];
    for (let index = 0; index < ranks.length; index += 1) {
      const numeric = `${index + 2} ${suit}`;
      const spelled = `${ranks[index]} ${suit}`;
      expect(hasPhotoInterpretationDepth(`${paragraph(spelled)}\n\n${conclusion}`, 1, summaryFor([numeric]))).toBe(true);
      expect(hasPhotoInterpretationDepth(`${paragraph(numeric)}\n\n${conclusion}`, 1, summaryFor([spelled]))).toBe(true);
      expect(hasPhotoInterpretationDepth(`${paragraph(`${index + 3} ${suit}`)}\n\n${conclusion}`, 1, summaryFor([numeric]))).toBe(false);
    }
  });

  it.each([["Паж Жезлов", "Пажа Жезлов"], ["Король Кубков", "Короля Кубков"], ["Королева Мечей", "Королевой Мечей"], ["Сила", "Силой"], ["Мир", "Мира"], ["Суд", "Суда"]])("accepts inflected %s without requiring the literal label", (name, inflected) => {
    expect(hasPhotoInterpretationDepth(`${paragraph(inflected)}\n\n${conclusion}`, 1, summaryFor([name]))).toBe(true);
  });

  it("does not confuse King and Queen or different suits", () => {
    expect(hasPhotoInterpretationDepth(`${paragraph("Королева Кубков")}\n\n${conclusion}`, 1, summaryFor(["Король Кубков"]))).toBe(false);
    expect(hasPhotoInterpretationDepth(`${paragraph("Восьмёрка Мечей")}\n\n${conclusion}`, 1, summaryFor(["8 Пентаклей"]))).toBe(false);
  });

  it("accepts exact cross-language deck aliases", () => {
    expect(hasPhotoInterpretationDepth(`${paragraph("Eight of Pentacles")}\n\n${conclusion}`, 1, summaryFor(["8 Пентаклей"]))).toBe(true);
    expect(hasPhotoInterpretationDepth(`${paragraph("Тройка Чаш")}\n\n${conclusion}`, 1, summaryFor(["3 Кубков"]))).toBe(true);
  });

  it("accepts the twelve-position failure fixture with numeric aliases and honest uncertainty", () => {
    const names = ["Паж Жезлов", "Туз Жезлов", "Рыцарь Пентаклей", "Мир", "Сила", "Дьявол", "8 Пентаклей", "Король Кубков", "Колесница", "Суд", "3 Пентаклей", "Пентакли (вероятно, Восьмерка или Девятка)"];
    const interpreted = names.slice(0, 11).map(name => paragraph(name.replace("8 Пентаклей", "Восьмёрка Пентаклей").replace("3 Пентаклей", "Тройка Пентаклей")));
    const uncertain = paragraph("Пентакли в последней позиции не определены точно: это Восьмёрка или Девятка. Надёжно читается только материальная тема");
    expect(assessPhotoInterpretation([...interpreted, uncertain, conclusion].join("\n\n"), 12, summaryFor(names))).toMatchObject({ok: true, missingCardPositions: []});
    expect(assessPhotoInterpretation([...interpreted, conclusion, conclusion].join("\n\n"), 12, summaryFor(names))).toMatchObject({ok: false, missingCardPositions: [12]});
    expect(hasPhotoInterpretationDepth([...interpreted, paragraph("Девятка Пентаклей точно означает успех"), conclusion].join("\n\n"), 12, summaryFor(names))).toBe(false);
    expect(hasPhotoInterpretationDepth([...interpreted, paragraph("8 Пентаклей предлагает выбрать работу или отдых"), conclusion].join("\n\n"), 12, summaryFor(names))).toBe(false);
    expect(hasPhotoInterpretationDepth([...interpreted, paragraph("Девятка Пентаклей точно означает успех; возможны хорошие изменения в работе"), conclusion].join("\n\n"), 12, summaryFor(names))).toBe(false);
    expect(hasPhotoInterpretationDepth([...interpreted, paragraph("Девятка Пентаклей точно означает успех. Будущее пока не определено"), conclusion].join("\n\n"), 12, summaryFor(names))).toBe(false);
  });

  it("preserves ambiguous recognition instead of inventing an exact card or art", () => {
    const label = "Восьмёрка или Девятка Пентаклей";
    expect(resolveAuraArtForDetected(label, {primarySystem: "tarot-veronika"})).toMatchObject({displayName: label, imagePath: "", placeholder: true});
    const spread = buildPartialRedrawSpread("veronika", [label]);
    expect(spread.cards[0].name).toBe(label);
    expect(buildSpreadSummaryForLlm(spread)).toContain("карта не определена точно");
  });

  it.each(["Карта в позиции 12 не определена точно", "Пентакли на позиции 12 не распознаны", "Карта не была распознана", "Неясно, какая именно карта", "Невозможно определить карту"])("accepts identity-bound uncertainty: %s", (acknowledgment) => {
    const label = "Пентакли (вероятно, Восьмерка или Девятка)";
    const text = `${paragraph(`${acknowledgment}. Видна лишь общая тема Пентаклей`)}\n\n${conclusion}`;
    expect(hasPhotoInterpretationDepth(text, 1, summaryFor([label]))).toBe(true);
  });

  it("assigns separate paragraphs even when card references overlap or repeat", () => {
    expect(hasPhotoInterpretationDepth([paragraph("Шут и Суд"), paragraph("Шут"), conclusion].join("\n\n"), 2, summaryFor(["Шут", "Суд"]))).toBe(true);
    expect(hasPhotoInterpretationDepth([paragraph("Шут"), paragraph("Шут"), conclusion].join("\n\n"), 2, summaryFor(["Шут", "Шут"]))).toBe(true);
    expect(hasPhotoInterpretationDepth([paragraph("Шут"), conclusion, conclusion].join("\n\n"), 2, summaryFor(["Шут", "Шут"]))).toBe(false);
  });

  it("returns safe, specific diagnostics and rejects malformed summaries", () => {
    expect(assessPhotoInterpretation("Шут", 1, summary)).toMatchObject({ok: false, detail: "insufficient_length"});
    expect(assessPhotoInterpretation(paragraph("Шут"), 1, summary)).toMatchObject({ok: false, detail: "insufficient_paragraphs"});
    expect(assessPhotoInterpretation(`${paragraph("Солнце")}\n\n${conclusion}`, 1, summary)).toMatchObject({ok: false, detail: "missing_card_positions:1"});
    expect(assessPhotoInterpretation(`${paragraph("Шут")}\n\n${conclusion}`, 1, "2. Position: «Шут»")).toMatchObject({ok: false, detail: "invalid_spread_summary"});
  });

  it("gives a twelve-card photo reading enough output room and clamps untrusted counts", () => {
    expect(photoInterpretationMaxTokens(12)).toBe(6760);
    expect(photoInterpretationMaxTokens(1000)).toBe(6760);
    expect(photoInterpretationMaxTokens(Number.NaN)).toBe(1600);
  });

  it("does not confuse Суд with Судьба", () => {
    const summary = "1. Позиция 1: «Суд»";
    const generic = Array.from({ length: 2 }, () =>
      `Судьба кажется предрешённой, но это общий текст без разбора карты. ${"У клиента остаётся выбор и ответственность за него. ".repeat(5)}`
    ).join("\n\n");
    expect(hasPhotoInterpretationDepth(generic, 1, summary)).toBe(false);
  });
});
