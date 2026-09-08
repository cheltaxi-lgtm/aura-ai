import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChatMessageRenderer from "@/components/ChatMessageRenderer";
import ReportRichText from "@/components/reports/ReportRichText";
import { polishSpreadReadingText, repairLegacyReadingHeadings } from "@/lib/reading-text-polish";


describe("reading emphasis boundaries", () => {
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
