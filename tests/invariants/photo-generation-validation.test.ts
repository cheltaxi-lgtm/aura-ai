import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidatedAiGenerateOptions } from "@/lib/validated-ai-generation";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/validated-ai-generation", () => ({ generateValidatedAiText: mocks.generate }));
vi.mock("@/lib/prompt-policy", () => ({ wrapSystemPrompt: async (text: string) => text }));
import { createPhotoInterpretationJson } from "@/lib/photo-reading-stream";

const params = {systemPrompt: "prompt", spreadSummary: "1. Позиция 1: «8 Пентаклей»", userName: "Тест", cardCount: 1};
beforeEach(() => {vi.clearAllMocks();});
afterEach(() => {vi.restoreAllMocks();});
describe("photo validated generation contract", () => {
  it("uses the paid model chain and repairs the specific missing positions", async () => {
    mocks.generate.mockImplementation(async (options: ValidatedAiGenerateOptions) => {
      expect(options.modelFamily).toBe("paid");
      expect(options.validatorVersion).toBe("photo-coverage-v2");
      const text = `Восьмёрка Пентаклей означает практический труд. ${"Здесь важны навык, повторение и проверка результата. ".repeat(3)}\n\nОбщий вывод: ${"Начни с малого и проверь результат на практике. ".repeat(3)}`;
      expect(options.validate(text)).toEqual({ok: true});
      const repair = options.buildRepairMessages!(text, "missing_card_positions:7,11");
      expect(repair.at(-1)?.content).toContain("7,11");
      expect(JSON.stringify(options.buildRepairMessages!(text, "private-user-text"))).not.toContain("private-user-text");
      return {ok: true, content: text, provenance: {validatorVersion: "photo-coverage-v2"}};
    });
    expect(await createPhotoInterpretationJson(params)).toMatchObject({llmFailed: false, provenance: {validatorVersion: "photo-coverage-v2"}});
  });
  it("preserves fixed diagnostic categories without delivering rejected prose", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generate.mockResolvedValue({ok: false, code: "validation_failed", detail: "missing_card_positions:1"});
    expect(await createPhotoInterpretationJson(params)).toEqual({reply: "", llmFailed: true, failureCode: "validation_failed", failureDetail: "missing_card_positions:1"});
  });
  it("never exposes provider detail or private input through diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generate.mockResolvedValue({ok: false, code: "provider_error", detail: "private-question email@example.test secret"});
    const result = await createPhotoInterpretationJson(params);
    expect(result.failureDetail).toBeUndefined();
    expect(JSON.stringify([result, warn.mock.calls])).not.toContain("private-question");
  });
  it.each([
    ["provider_error", "missing_card_positions:1"],
    ["validation_failed", "missing_card_positions:4111111111111111"],
    ["validation_failed", "missing_card_positions:12"],
  ])("refuses provider lookalikes or out-of-range position diagnostics: %s/%s", async (code, detail) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generate.mockResolvedValue({ok: false, code, detail});
    expect((await createPhotoInterpretationJson(params)).failureDetail).toBeUndefined();
  });
});
