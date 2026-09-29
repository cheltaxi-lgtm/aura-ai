import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JointPersonalReading from "@/components/joint/JointPersonalReading";
import { parseJointPersonalReading } from "@/lib/joint-reading-display";
import { buildJointPersonalPrompt, jointCombinedQualityIssue, jointPersonalQualityIssue } from "@/lib/joint-reading-quality";
import { jointSideAvailability, type JointReadingRow } from "@/lib/joint-reading-service";
import { isTerminalIntentionSpreadError } from "@/lib/intention-spread-client";

const cards = [
  { name: "Колесница", position: "Вы" },
  { name: "Маг", position: "Партнёр" },
  { name: "4 Кубков", position: "Итог" },
];

describe("joint reading personal stage", () => {
  it("turns saved bold card paragraphs into actual position cards without visible markdown", () => {
    const content = [
      "Первый взгляд на собственную роль в отношениях.",
      "**Колесница — позиция «Вы».** Важно понять, куда двигаться.",
      "**Маг — позиция «Партнёр».** Эта позиция задаёт вопрос об инициативе.",
      "**4 Кубков — позиция «Итог».** Обрати внимание на усталость.",
      "## Простыми словами",
      "Общий вывод появится после ответа второго участника.",
    ].join("\n\n");
    const parsed = parseJointPersonalReading(content, cards);
    expect(parsed?.cards.map((card) => card.position)).toEqual(["Вы", "Партнёр", "Итог"]);
    expect(parsed?.cards[0].text).toBe("Важно понять, куда двигаться.");
    const html = renderToStaticMarkup(React.createElement(JointPersonalReading, { content, cards, complete: false }));
    expect(html).toContain("Общая интерпретация появится");
    expect(html).toContain("Что взять с собой");
    expect(html).not.toContain("**");
    expect(html.match(/joint-personal-reading__card-head/g)).toHaveLength(3);
  });

  it("accepts new heading-based sections and keeps conclusions separate", () => {
    const content = "Видно желание определиться.\n\n### Вы · Колесница\n\nВыбери направление.\n\n### Партнёр · Маг\n\nНе приписывай другому намерения.\n\n### Итог · 4 Кубков\n\nЗаметь, чего не хватает.\n\n## Что взять с собой\n\nСравни с ответом другого человека.";
    const parsed = parseJointPersonalReading(content, cards);
    expect(parsed?.cards).toHaveLength(3);
    expect(parsed?.closing).toContain("Сравни");
    const tightHeading = content.replace("## Что взять с собой\n\nСравни", "## Что взять с собой\nСравни");
    expect(parseJointPersonalReading(tightHeading, cards)?.closing).toContain("Сравни");
  });

  it("forbids a bilateral verdict until both readings exist", () => {
    const prompt = buildJointPersonalPrompt({ intentSlug: "sovmestimost-pary", otherDone: false, positions: cards.map((card) => card.position) });
    expect(prompt).toContain("Второй участник ещё не вытянул свои карты");
    expect(prompt).toContain("не оценивай совместимость".replace("не", "Не"));
    expect(prompt).not.toContain("Анна");
    const secondPrompt = buildJointPersonalPrompt({ intentSlug: "sovmestimost-pary", otherDone: true, positions: cards.map((card) => card.position) });
    expect(secondPrompt).toContain("Расклад второго участника уже готов");
    expect(secondPrompt).not.toContain("Второй участник ещё не вытянул");
    expect(jointPersonalQualityIssue("Вердикт: совместимость высокая, вы совместимы.")).toBe("premature_compatibility_verdict");
    expect(jointPersonalQualityIssue("Ты способны поддержать друг друга.")).toBe("broken_person_agreement");
    expect(jointPersonalQualityIssue("Колесница предлагает выбрать направление самому.")).toBeNull();
  });

  it("rejects an occupied or expired side before billing", () => {
    const row = {
      status: "pending_partner",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      initiator_user_id: "owner",
      initiator_reading: "Личный ответ",
      partner_user_id: null,
      partner_reading: null,
    } as JointReadingRow;
    expect(jointSideAvailability(row, "owner")).toContain("уже сохранён");
    expect(jointSideAvailability(row, "partner")).toBeNull();
    expect(jointSideAvailability({ ...row, partner_user_id: "partner", partner_reading: "Ответ" }, "partner")).toContain("уже сохранён");
    expect(jointSideAvailability({ ...row, partner_user_id: "someone-else" }, "partner")).toContain("занят");
    expect(jointSideAvailability({ ...row, expires_at: new Date(Date.now() - 1000).toISOString() }, "partner")).toContain("истекло");
  });

  it("requires readable sections and substance before delivering a paid joint stage", () => {
    const paragraph = "Карта указывает на тему выбора и предлагает обсудить наблюдаемое действие, не приписывая другому человеку неизвестных намерений. ";
    const personal = [
      paragraph.repeat(2),
      ...cards.map((card) => `### ${card.position} · ${card.name}\n\n${paragraph.repeat(3)}`),
      `## Что взять с собой\n\n${paragraph.repeat(2)}`,
    ].join("\n\n");
    expect(jointPersonalQualityIssue(personal, cards.length)).toBeNull();
    expect(jointPersonalQualityIssue("Колесница, Маг, 4 Кубков: всё хорошо.", cards.length)).toBe("too_short");
    expect(jointPersonalQualityIssue(personal.replace("## Что взять с собой", "Итог"), cards.length)).toBe("missing_closing");

    const combined = ["Суть связи", "Что поддерживает", "Что мешает", "Что делать дальше"]
      .map((heading) => `## ${heading}\n\n${paragraph.repeat(4)}`).join("\n\n");
    expect(jointCombinedQualityIssue(combined)).toBeNull();
    expect(jointCombinedQualityIssue(combined.replace("## Что мешает", "Затруднения"))).toBe("missing_sections");
    expect(jointCombinedQualityIssue("Оба расклада похожи.")).toBe("too_short");
  });

  it("does not enqueue another paid job when an attach outcome is unknown", () => {
    const error = Object.assign(new Error("Не удалось подтвердить сохранение"), { code: "joint_attach_unknown" });
    expect(isTerminalIntentionSpreadError(error)).toBe(true);
  });
});
