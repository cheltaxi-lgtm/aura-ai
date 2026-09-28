import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import ReportRichText from "@/components/reports/ReportRichText";
import { polishSpreadReadingText, repairLegacyReadingHeadings } from "@/lib/reading-text-polish";
import { formatPremiumReadingForDisplay } from "@/lib/format-premium-reading";


describe("reading emphasis boundaries", () => {
  it("renders a saved three-card reading as distinct position sections without raw stars", () => {
    const content = [
      "Расклад в плюс: ты выходишь из сложного периода к спокойствию.",
      "**5 Кубков — прошлое. ** Прежнее разочарование влияло на решения.",
      "**Отшельник — настоящее. ** Сейчас полезно разобраться в себе.",
      "**Король Кубков — будущее. ** Дальше возможен зрелый разговор.",
      "Итог: выбери один спокойный шаг.",
    ].join("\n\n");
    const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, { content }));
    for (const [position, card] of [["Прошлое", "5 Кубков"], ["Настоящее", "Отшельник"], ["Будущее", "Король Кубков"]]) {
      expect(html).toContain(`>${position}</span>`);
      expect(html).toContain(`>${card}</h3>`);
    }
    expect(html).not.toContain("**");
    expect(html.match(/<h3 /g)).toHaveLength(3);
    expect(html).toContain("border-aura-gold/25");
    expect(html).toContain(">5 Кубков</h3>");
    expect(html).toContain("Прежнее разочарование влияло на решения.");
    const printHtml = renderToStaticMarkup(React.createElement(ReportRichText, { content }));
    expect(printHtml.match(/<h3>/g)).toHaveLength(3);
    expect(printHtml).not.toContain("**");
  });
  it("styles the position-first format requested for new introductory readings", () => {
    const content = "Общий смысл в спокойном выборе.\n\nПрошлое — 5 Кубков\n\nРазочарование осталось позади.\n\nНастоящее — Отшельник\n\nСейчас нужна пауза.\n\nБудущее — Король Кубков\n\nОткроется возможность для разговора.";
    const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, { content }));
    expect(html.match(/<h3 /g)).toHaveLength(3);
    for (const [position, card] of [["Прошлое", "5 Кубков"], ["Настоящее", "Отшельник"], ["Будущее", "Король Кубков"]]) {
      expect(html).toContain(`>${position}</span>`);
      expect(html).toContain(`>${card}</h3>`);
    }
  });
  it("restores card-first prose from an existing saved introductory reading", () => {
    const content = [
      "Общий смысл расклада — выбор нового направления.",
      "**Королева Жезлов** в прошлом — уверенность и личная сила.",
      "**Влюблённые** в настоящем — честный выбор и союз.",
      "**Паж Кубков** в будущем — возможность мягкого нового начала.",
      "Простыми словами: сделай один шаг к тому, что тебе важно.",
    ].join("\n\n");
    for (const Component of [ChatMessageRenderer, ReportRichText]) {
      const html = renderToStaticMarkup(React.createElement(Component, { content }));
      expect(html.match(/<h3[ >]/g)).toHaveLength(3);
      expect(html).not.toContain("**");
      expect(html).toContain("уверенность и личная сила");
      expect(html).toContain("честный выбор и союз");
      expect(html).toContain("мягкого нового начала");
      for (const card of ["Королева Жезлов", "Влюблённые", "Паж Кубков"]) {
        expect(html).toContain(card);
      }
    }
  });
  it("does not reinterpret ordinary report sections or incomplete spreads as tarot cards", () => {
    const report = "Прошлое — влияние семьи\n\nНастоящее — выбор работы\n\nБудущее — пространство для роста";
    expect(formatPremiumReadingForDisplay(report)).not.toContain("### Прошлое ·");
    const incomplete = "Прошлое — Сила\n\nНастоящее — Отшельник";
    expect(formatPremiumReadingForDisplay(incomplete)).not.toContain("### Прошлое ·");
    const celtic = "Настоящее — Сила\n\nВызов — Луна\n\nПрошлое — Отшельник\n\nБудущее — Мир";
    expect(formatPremiumReadingForDisplay(celtic)).not.toContain("### Прошлое ·");
  });
  it("leaves non-card text alone even when three valid card sections are present", () => {
    const mixed = "Прошлое — Сила\n\nНастоящее — Отшельник\n\nБудущее — Мир\n\nПрошлое — влияние семьи";
    const formatted = formatPremiumReadingForDisplay(mixed);
    expect(formatted).toContain("### Прошлое · Сила");
    expect(formatted).toContain("Прошлое — влияние семьи");
    expect(formatted).not.toContain("### Прошлое · влияние семьи");
  });
  it("keeps daily position headings without turning a later sentence into another heading", () => {
    const formatted = formatPremiumReadingForDisplay(
      "Утро — действуй спокойно.\nДень — выбери цель.\nВечер — проверь слова.\nВечер может показать новую мысль."
    );
    expect(formatted).toContain("### Утро");
    expect(formatted).toContain("### День");
    expect(formatted.match(/### Вечер/g)).toHaveLength(1);
    expect(formatted).toContain("Вечер может показать новую мысль.");
  });
  it("preserves adjacent card title and bold opening without inserting another card", () => {
    const text = "**8 Пентаклей**\n\n**8 Пентаклей в позиции «Итог»** — усердие, оттачивание мастерства и кропотливый труд.";
    expect(polishSpreadReadingText(text, ["8 Пентаклей"])).toBe(text);
  });
  it.each(["**Личность**\n\n**Отношения**", "**Тип** **Авторитет**", "*Утро*\n\n*Вечер*", "**Солнце** и **Луна**", "**Солнце *в Овне* яркое** **Луна**", "***Сила***", "****"])("preserves existing emphasis: %s", text => {
    expect(polishSpreadReadingText(text)).toBe(text);
  });
  it("replaces genuine empty placeholders without consuming valid emphasis", () => {
    expect(polishSpreadReadingText("* * — начало. ** ** — продолжение.", ["Шут", "Маг"])).toBe("**Шут** — начало. **Маг** — продолжение.");
  });
  it("is stable across persistence and repeated display", () => {
    const text = "**8 Пентаклей**\n\n**8 Пентаклей в позиции «Итог»** — усердие.";
    const once = polishSpreadReadingText(text, ["8 Пентаклей"]);
    expect(polishSpreadReadingText(once, ["8 Пентаклей"])).toBe(once);
  });
});

describe("report rendering", () => {
  const damaged = "**8 Пентаклей***8 Пентаклей***8 Пентаклей в позиции «Итог»** — усердие.";
  it("repairs the saved corruption from the screenshot without changing its prose", () => {
    expect(repairLegacyReadingHeadings(damaged)).toBe("**8 Пентаклей**\n\n**8 Пентаклей в позиции «Итог»** — усердие.");
    expect(repairLegacyReadingHeadings("**Солнце***Луна***Отношения**")).toBe("**Солнце***Луна***Отношения**");
  });
  for (const variant of ["mystic", "print"] as const) {
    it(`renders nested emphasis without stray stars for ${variant}`, () => {
      const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, { content: "***Сила*** и **Солнце *в Овне* яркое**", variant }));
      expect(html).not.toContain("*");
      expect(html).toContain("Сила");
      expect(html).toContain("в Овне");
    });
    it(`recognizes lower-level headings for ${variant}`, () => {
      const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, { content: "#### Ваши ресурсы\n\nТекст раздела.", variant }));
      expect(html).toContain("<h4>Ваши ресурсы</h4>");
    });
    it(`preserves formatted headings for ${variant} reports`, () => {
      const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, {
        content: "## **Личность** и *ресурсы*\n\nТекст раздела.\n\n### Солнце в **Овне**\n\nСледующий раздел.", variant,
      }));
      expect(html).not.toContain("[object Object]");
      expect(html).toMatch(/<strong[^>]*>Личность<\/strong> и <em[^>]*>ресурсы<\/em>/);
      expect(html).toMatch(/Солнце в <strong[^>]*>Овне<\/strong>/);
    });
    it(`separates a saved damaged title from body for ${variant}`, () => {
      const html = renderToStaticMarkup(React.createElement(ChatMessageRenderer, { content: damaged, variant }));
      expect(html.match(/<p[ >]/g)).toHaveLength(2);
      expect(html).not.toContain("<em");
    });
  }
  it("restores the same old title for exported rich-text reports", () => {
    const html = renderToStaticMarkup(React.createElement(ReportRichText, { content: damaged }));
    expect(html.match(/<p[ >]/g)).toHaveLength(2);
    expect(html).not.toContain("<em");
  });
});
