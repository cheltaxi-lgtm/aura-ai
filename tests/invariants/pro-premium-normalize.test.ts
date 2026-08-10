import { describe, expect, it } from "vitest";
import {
  collapseDuplicateNameOpeners,
  countFocusRefrains,
  extractPracticeFromBody,
  normalizeClientVyAddress,
  normalizeProPremiumBlocks,
  repairVyVerbAgreement,
  stripFocusRefrain,
} from "@/modules/pro/ai/pro-premium-normalize";
import type { ProReportBlock } from "@/modules/pro/domain/types";

const FOCUS = "Деньги и отношения интересуют";

describe("pro premium normalize", () => {
  it("rewrites ты-address to Вы forms and repairs verb agreement", () => {
    const out = normalizeClientVyAddress(
      "Ксения, ты получила карту. Ты чувствуешь больше, чем можешь сказать. Тебе важно беречь твою энергию."
    );
    expect(out.toLowerCase()).not.toMatch(/(?<!\p{L})ты(?!\p{L})/u);
    expect(out.toLowerCase()).not.toMatch(/(?<!\p{L})тебе(?!\p{L})/u);
    expect(out).toMatch(/вы получили/i);
    expect(out).toMatch(/вы чувствуете/i);
    expect(out).toMatch(/можете сказать/i);
    expect(out).toMatch(/вам важно/i);
    expect(out).toMatch(/вашу энергию/i);
  });

  it("collapses Ксения, ксения, openers", () => {
    expect(collapseDuplicateNameOpeners("Ксения, ксения, ваша сила", "Ксения")).toBe(
      "Ксения, ваша сила"
    );
    expect(repairVyVerbAgreement("Выбери одну границу и будь внимательна")).toMatch(
      /Выберите одну границу и будьте/i
    );
  });

  it("fixes ksenia-style matrix zone opener and practice voice", () => {
    const out = normalizeProPremiumBlocks(
      [
        {
          id: "matrix-intro",
          title: "Вступление",
          body: "Ксения, ты получила полную матрицу судьбы Zovus.",
          sectionKind: "intro",
        },
        {
          id: "matrix-zone-character",
          title: "Характер (2 — Жрица)",
          body: "Ксения, ксения, ваша натура — это глубина. Вы чувствуешь больше, чем можешь выразить.",
          practice: "7 дней записывай одно важное решение. Выбери одно правило.",
          sectionKind: "zone",
        },
      ],
      { clientAlias: "Ксения", caseType: "matrix" }
    );
    const intro = out.find((b) => b.id === "matrix-intro");
    const zone = out.find((b) => b.id === "matrix-zone-character");
    expect(intro?.body).toMatch(/^Ксения, вы получили/i);
    expect(zone?.body.toLowerCase()).not.toMatch(/ксения,\s*ксения/);
    expect(zone?.body).toMatch(/вы чувствуете/i);
    expect(zone?.practice).toMatch(/записывайте/i);
    expect(zone?.practice).toMatch(/Выберите|выберите/);
  });

  it("extracts practice tail from body", () => {
    const { prose, practice } = extractPracticeFromBody(
      "Текст зоны.\n\nПрактика: один шаг на этой неделе."
    );
    expect(prose).toBe("Текст зоны.");
    expect(practice).toBe("один шаг на этой неделе.");
  });

  it("extracts HD «Что делать» / typo «Чрактика» tails into practice", () => {
    const a = extractPracticeFromBody(
      "Механика стратегии.\n\nЧто делать: практикуйте фразы «Я собираюсь…»."
    );
    expect(a.prose).toBe("Механика стратегии.");
    expect(a.practice).toMatch(/практикуйте фразы/i);

    // Same-line tail (common in HD sectional prose).
    const sameLine = extractPracticeFromBody(
      "Если работаете «как все» — тратите силу впустую. Что делать: отслеживайте импульсы."
    );
    expect(sameLine.prose).toMatch(/впустую\.$/);
    expect(sameLine.practice).toMatch(/отслеживайте импульсы/i);

    const bang = extractPracticeFromBody(
      "Защищайте покой! Что делать: три паузы в день."
    );
    expect(bang.practice).toMatch(/три паузы/i);

    const dash = extractPracticeFromBody(
      "Информируйте до старта — Что делать: скажите «я начинаю»."
    );
    expect(dash.practice).toMatch(/я начинаю/i);

    const b = extractPracticeFromBody(
      "Селезёнка. Чрактика: фиксируйте первую реакцию тела."
    );
    expect(b.practice).toMatch(/фиксируйте/i);

    const blocks = normalizeProPremiumBlocks(
      [
        {
          id: "hd-strategy",
          title: "Стратегия",
          body: "Манифестор информирует. Что делать: скажите до старта, не после.",
        },
      ],
      { clientAlias: "Владимир", caseType: "hd" }
    );
    expect(blocks[0]?.practice).toMatch(/скажите до старта/i);
    expect(blocks[0]?.body).not.toMatch(/Что делать/i);
  });

  it("strips focus refrain spam from zone bodies", () => {
    const raw =
      "Снежана, снежана, ваш запрос о деньгах и отношениях сейчас проходит через призму осознания зависимостей. В этом возрасте вы особенно чувствительны к границам.";
    const stripped = stripFocusRefrain(raw, FOCUS);
    expect(stripped.toLowerCase()).not.toContain("ваш запрос");
    expect(stripped.toLowerCase()).not.toContain("деньги и отношения интересуют");
    expect(stripped).toMatch(/возрасте/i);
    expect(stripped.toLowerCase()).not.toMatch(/снежана,\s*снежана/);
  });

  it("normalizes matrix-like blocks: focus, Вы, practice, sectionKind, no refrain", () => {
    const blocks: ProReportBlock[] = [
      {
        id: "q0",
        title: "Запрос",
        body: FOCUS,
        ai_confidence: 1,
      },
      {
        id: "matrix-zone-money",
        title: "Деньги (18 — Луна)",
        body: `Снежана, твой запрос про деньги и отношения интересует тебя. Ты держишь деньги близко к груди.\n\nПрактика: выпиши три источника дохода за 7 дней.`,
      },
      {
        id: "matrix-zone-love",
        title: "Отношения (21 — Мир)",
        body: `Снежана, ты исследуешь деньги и отношения. Тебе нужна ясность в контакте.`,
        practice: "Один честный разговор без ультиматума.",
      },
    ];

    const out = normalizeProPremiumBlocks(blocks, {
      clientAlias: "Снежана",
      focus: FOCUS,
      caseType: "matrix",
    });

    expect(out[0]?.sectionKind).toBe("focus");
    expect(out[0]?.title).toMatch(/ответ на ваш запрос/i);
    expect(polishLen(out[0]?.body)).toBeGreaterThanOrEqual(200);

    const money = out.find((b) => b.id === "matrix-zone-money");
    expect(money?.sectionKind).toBe("zone");
    expect(money?.eyebrow).toMatch(/18/);
    expect(money?.practice).toMatch(/доход/i);
    expect(money?.body.toLowerCase()).not.toMatch(/(?<!\p{L})ты(?!\p{L})/u);
    expect(money?.body.toLowerCase()).not.toContain("твой запрос");

    const love = out.find((b) => b.id === "matrix-zone-love");
    expect(love?.practice).toBeTruthy();
    expect(countFocusRefrains(out, FOCUS)).toBe(0);
  });

  it("normalizes hd/natal/manual fixtures with focus present", () => {
    for (const caseType of ["hd", "natal", "manual_spread"] as const) {
      const blocks: ProReportBlock[] = [
        {
          id: `${caseType}-1`,
          title: "Характер",
          body: "Ты действуешь из внутренней опоры. Тебе помогает ясный ритм дня.",
        },
        {
          id: `${caseType}-2`,
          title: "Практика недели",
          body: "Каждый вечер отметь один шаг, который ты сделала для себя.",
        },
      ];
      const out = normalizeProPremiumBlocks(blocks, {
        clientAlias: "Светлана",
        focus: "Как мне двигаться в работе?",
        caseType,
      });
      expect(out.some((b) => b.sectionKind === "focus")).toBe(true);
      const joined = out.map((b) => b.body).join("\n");
      expect(joined.toLowerCase()).not.toMatch(/(?<!\p{L})ты(?!\p{L})/u);
      expect(joined.toLowerCase()).toMatch(/(?<!\p{L})вы(?!\p{L})/u);
    }
  });
});

function polishLen(s?: string): number {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim().length;
}
