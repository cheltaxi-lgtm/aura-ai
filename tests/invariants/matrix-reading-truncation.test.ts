import { beforeEach, describe, expect, it, vi } from "vitest";
import { matrixProseHasCompleteEnding, matrixReadingStepsAreComplete, matrixStepsAreComplete } from "@/lib/numerology/matrix-prose-completeness";

const state = vi.hoisted(() => ({ mode: "retry" as "retry" | "always-length" | "cut-stop", stepCalls: 0, budgets: [] as number[] }));
const steps = Array.from({ length: 6 }, (_, i) => `${i + 1}) В дни ${i * 5 + 1}–${i * 5 + 5} запиши наблюдение и выбери одно посильное действие.`).join("\n");
vi.mock("@/lib/ai-model", () => ({ resolveMatrixModelChain: async () => ["test-chat"] }));
vi.mock("@/lib/llm", () => ({ completeChatDetailed: async (input: { messages: Array<{ content: string }>; maxTokens: number }) => {
  const prompt = input.messages.map(m => m.content).join("\n");
  const title = prompt.match(/Первая строка заголовка ДОЛЖНА быть точно: ([^\n]+)/)?.[1];
  if (!title) {
    state.stepCalls++; state.budgets.push(input.maxTokens);
    const cut = state.mode !== "retry" || state.stepCalls === 1;
    return { text: `Шаги на 30 дней\n${cut ? steps.replace(/6\)[\s\S]+$/, "6) На 28–30 - й день подготовься к") : steps}`, finishReason: state.mode === "cut-stop" ? "stop" : cut ? "length" : "stop" };
  }
  return { text: `${title}\nДля «${title}» выбери конкретную ситуацию, в которой хочешь лучше понять свои реакции. Отметь ресурс именно «${title}» и запиши его проявление. Определи границу для «${title}», чтобы действие оставалось посильным. Проверь результат в конце недели для «${title}».\nПрактика: запиши одно наблюдение о «${title}» и повтори действие.`, finishReason: "stop" };
} }));
import { generateFullMatrixSectionedReading } from "@/lib/numerology/matrix-sectioned-reading";
import { isCompleteMatrixReading } from "@/lib/numerology/matrix-completeness";

beforeEach(() => { state.mode = "retry"; state.stepCalls = 0; state.budgets = []; });
describe("Matrix report cutoffs", () => {
  it("checks every action independently of a complete finale", () => {
    expect(matrixStepsAreComplete(steps)).toBe(true);
    const cut = steps.replace(/6\)[\s\S]+$/, "6) На 28–30 - й день подготовься к");
    expect(matrixReadingStepsAreComplete(`## Шаги на 30 дней\n\n${cut}\n\n## Простыми словами\nПолный итог.`)).toBe(false);
    expect(matrixStepsAreComplete(steps.replace("2)", "3)"))).toBe(false);
    expect(matrixStepsAreComplete(`${steps}\n7)`)).toBe(false);
    expect(matrixStepsAreComplete(steps.replace("выбери одно посильное действие.", "выбери одно посильное дей"))).toBe(false);
    expect(matrixStepsAreComplete(steps.split("\n").slice(0, 3).join("\n"))).toBe(true);
    expect(matrixReadingStepsAreComplete(`Что делать\n${steps}\n\nПростыми словами:\nПолный итог.`)).toBe(true);
    for (const prefix of ["", "### "]) {
      expect(matrixReadingStepsAreComplete(`## Шаги на 30 дней\n${cut}\n\n${prefix}Для чего дан ребёнок\nПомоги ребёнку исследовать интересы.\n\n## Простыми словами\nПолный итог.`)).toBe(false);
      expect(matrixReadingStepsAreComplete(`## Шаги на 30 дней\n${steps}\n\n${prefix}Для чего дан ребёнок\nПомоги ребёнку исследовать интересы.`)).toBe(true);
    }
    expect(matrixReadingStepsAreComplete(`✨ Что делать\n${steps}`)).toBe(true);
  });
  it("does not mistake a closing quote or a long cut paragraph for a complete sentence", () => {
    expect(matrixProseHasCompleteEnding("Повтори действие и запиши результат.»")).toBe(true);
    expect(matrixProseHasCompleteEnding("Повтори незавершённое дей»")).toBe(false);
    expect(matrixProseHasCompleteEnding("Законченное предложение. ".repeat(30) + "Практика: запиши наблюд")).toBe(false);
  });
  it("retries a long provider cutoff with more tokens and keeps the complete sixth action", async () => {
    const result = await generateFullMatrixSectionedReading({ birthDate: "1990-08-15", name: "Анна", useLlm: "all", asOfDate: "2026-10-01" });
    expect(state.stepCalls).toBe(2);
    expect(state.budgets[1]).toBeGreaterThan(state.budgets[0]!);
    expect(result.document.zones.find(z => z.id === "steps")?.source).toBe("ai");
    expect(result.reading).toContain("6) В дни 26–30");
    expect(isCompleteMatrixReading(result.reading)).toBe(true);
    expect(isCompleteMatrixReading(result.reading.replace(/6\) В дни 26–30[^\n]+/, "6) На 28–30 - й день подготовься к"))).toBe(false);
  });
  it.each(["always-length", "cut-stop"] as const)("never delivers a broken action when the provider keeps returning %s", async mode => {
    state.mode = mode;
    const result = await generateFullMatrixSectionedReading({ birthDate: "1990-08-15", name: "Анна", useLlm: "all", asOfDate: "2026-10-01" });
    const block = result.document.zones.find(z => z.id === "steps")!;
    expect(block.source).toBe("engine");
    expect(matrixStepsAreComplete(block.prose)).toBe(true);
    expect(result.reading).not.toContain("подготовься к");
  });
});
