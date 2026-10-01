import { describe, expect, it, vi } from "vitest";
import { destinyMatrix, matrixToStructuredData } from "@/lib/numerology/destiny-matrix";
import { matrixDocumentMatchesEngine, matrixProseMatchesRoles, matrixReadingMatchesEngine } from "@/lib/numerology/matrix-completeness";
import { listMatrixZones } from "@/lib/numerology/matrix-zones";
import { headingLineForZone, parseZoneBlock, renderMatrixReadingMarkdown } from "@/lib/numerology/matrix-reading-document";

const calls = vi.hoisted(() => ({ prompts: [] as string[], duplicate: false }));
vi.mock("@/lib/ai-model", () => ({ resolveMatrixModelChain: async () => ["test-chat"] }));
vi.mock("@/lib/llm", () => ({ completeChatDetailed: async (input: { messages: Array<{ content: string }> }) => {
  const prompt = input.messages.map((m) => m.content).join("\n");
  calls.prompts.push(prompt);
  const title = prompt.match(/Первая строка заголовка ДОЛЖНА быть точно: ([^\n]+)/)?.[1] ?? "Шаги на 30 дней";
  const text = title === "Шаги на 30 дней"
    ? `${title}\n1) Заметь реакцию ребёнка в новой ситуации и обсуди его потребность в поддержке.\n2) Выбери одно посильное действие на неделю и проверь, насколько удобно его повторять.\n3) Вместе оцени результат без сравнений с другими детьми.\n4) В конце месяца обсуди, какую поддержку стоит продолжить.`
    : calls.duplicate
      ? `${title}\nОбсуди с близким человеком его потребности без оценки. Выбери посильный шаг и договорись о сроке следующей встречи. Заметь результат и проверь, удобно ли повторять действие в обычной жизни.\nПрактика: запиши наблюдение после разговора и проверь реакцию собеседника.`
      : `${title}\nВ зоне «${title}» ресурс проявляется через выбор посильного действия в знакомой ситуации. Обсуди с ребёнком проявления «${title}» без оценки. Для «${title}» помоги ему выбрать способ участия. Запиши наблюдения именно про «${title}», чтобы не смешивать разные ситуации.\nПрактика: понаблюдай за «${title}» и запиши одно конкретное изменение.`;
  return { text, finishReason: "stop" };
} }));

import { buildMatrixAuthoritativeFacts, generateFullMatrixSectionedReading, matrixAiZonesCanaryMin, matrixZoneTextsRepeat } from "@/lib/numerology/matrix-sectioned-reading";

describe("matrix generation audit repairs", () => {
  it("detects copied prose after a changed heading while allowing distinct roles", () => {
    const prose = "Обсуди с близким человеком его потребности без оценки. Выбери посильный шаг и договорись о сроке следующей встречи. Заметь результат и проверь, удобно ли повторять действие в обычной жизни.";
    expect(matrixZoneTextsRepeat(`Деньги (4)\n${prose}`, `Отношения (9)\n${prose}`)).toBe(true);
    expect(matrixZoneTextsRepeat(`Деньги (4)\n${prose}`, "Таланты (20)\nОсвой новый инструмент для конкретной рабочей задачи. Попроси обратную связь о качестве результата. Повтори действие в другом контексте и сравни успешность подхода.")).toBe(false);
  });
  it("delivers a fully successful child AI report without an impossible adult canary", async () => {
    const result = await generateFullMatrixSectionedReading({ birthDate: "2015-03-12", name: "Анна", toolId: "child_matrix", useLlm: "all", asOfDate: "2026-09-30" });
    expect(result.meta.totalZones).toBe(12);
    expect(result.meta.aiZones).toBe(12);
    expect(matrixAiZonesCanaryMin("child_matrix", 12)).toBe(9);
    expect(matrixAiZonesCanaryMin("destiny_matrix", 22)).toBe(15);
    expect(matrixAiZonesCanaryMin("destiny_matrix", 10)).toBe(10);
    expect(result.reading).toContain("Как поддержать ребёнка как родитель");
  });

  it("refuses a paid report when AI keeps duplicating zones after a contextual rewrite", async () => {
    calls.prompts.length = 0;
    calls.duplicate = true;
    try {
      await expect(generateFullMatrixSectionedReading({ birthDate: "2015-03-12", name: "Анна", toolId: "child_matrix", useLlm: "all", asOfDate: "2026-09-30" })).rejects.toMatchObject({ code: "matrix_ai_canary" });
      expect(calls.prompts.some((p) => p.includes("УЖЕ НАПИСАННЫЕ СОСЕДНИЕ БЛОКИ"))).toBe(true);
    } finally {
      calls.duplicate = false;
    }
  });

  it("rejects a wrong role number already present in another zone, but permits a correct comparison", () => {
    const matrix = destinyMatrix("1990-08-15", { asOfDate: "2026-09-30" });
    expect(matrix.money.number).not.toBe(matrix.relationships.number);
    expect(matrixProseMatchesRoles(`Ваш денежный канал — аркан ${matrix.relationships.number} — ${matrix.relationships.arcanaName}.`, matrix)).toBe(false);
    expect(matrixProseMatchesRoles(`Денежный канал — аркан ${matrix.money.number}; отношения — аркан ${matrix.relationships.number}. Их ресурсы дополняют друг друга.`, matrix)).toBe(true);
    const zones = listMatrixZones(matrix).map((z) => parseZoneBlock(`${headingLineForZone(z)}\nРазбор зоны.`, z, "ai"));
    const money = zones.find((z) => z.id === "money")!;
    money.prose = `Ваш денежный канал — аркан ${matrix.relationships.number} — ${matrix.relationships.arcanaName}.`;
    const doc = { schemaVersion: 1 as const, intro: "", zones, finale: "Простыми словами: итог.", meta: { aiZones: zones.length, engineZones: 0, totalZones: zones.length } };
    expect(matrixDocumentMatchesEngine(doc, matrix)).toBe(false);
    expect(matrixReadingMatchesEngine(renderMatrixReadingMarkdown(doc), matrix)).toBe(false);
  });

  it("puts frozen facts before lengthy optional context and never silently truncates them", async () => {
    calls.prompts.length = 0;
    const matrix = destinyMatrix("1990-08-15", { calculationVersion: "matrix-v4", asOfDate: "2025-02-04" });
    await generateFullMatrixSectionedReading({ birthDate: "1990-08-15", name: "Анна", snapshot: matrixToStructuredData(matrix), asOfDate: "2026-09-30", useLlm: "all", contextFacts: "Память клиента. ".repeat(500) });
    expect(calls.prompts.length).toBeGreaterThan(0);
    for (const prompt of calls.prompts) {
      expect(prompt).toContain("дата расчёта 2025-02-04");
      expect(prompt).toContain(`Деньги: ${matrix.money.number} — ${matrix.money.arcanaName}`);
      expect(prompt.indexOf("ЧИСЛА ДВИЖКА")).toBeLessThan(prompt.indexOf("Память клиента"));
    }
    expect(buildMatrixAuthoritativeFacts(matrix)).toContain("Канал");
  });
});
