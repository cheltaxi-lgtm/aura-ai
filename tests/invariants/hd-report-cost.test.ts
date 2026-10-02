import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openRouterFetchMock = vi.fn();

vi.mock("@/lib/openrouter-fetch", () => ({
  openRouterFetch: (...args: unknown[]) => openRouterFetchMock(...args),
}));

vi.mock("@/lib/brand", () => ({
  openRouterAppHeaders: () => ({ "X-Title": "test" }),
}));

const CATALOG = {
  data: [
    // Real shape: USD per single token, as strings.
    {
      id: "deepseek/deepseek-chat-v3-0324",
      pricing: { prompt: "0.00000027", completion: "0.00000112" },
    },
    { id: "openai/gpt-5.6-luna", pricing: { prompt: "0.0000001", completion: "0.0000006" } },
    { id: "broken/no-pricing", pricing: {} },
  ],
};

function catalogResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

describe("HD report cost: live OpenRouter pricing", () => {
  beforeEach(() => {
    vi.resetModules();
    openRouterFetchMock.mockReset();
    process.env.OPENROUTER_USD_RUB = "90";
  });

  afterEach(() => {
    process.env.OPENROUTER_USD_RUB = "90";
  });

  it("does not present incomplete provider usage as zero or a partial actual cost",async()=>{
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const {resolveCostRubFromUsage}=await import("@/lib/hd-report-pipeline/cost");
    for(const usage of [{promptTokens:0,completionTokens:0,complete:false},{promptTokens:10,completionTokens:20,complete:false}])expect(await resolveCostRubFromUsage(usage,"openai/gpt-5.6-luna")).toEqual({rub:null,source:"unavailable"});
    expect(openRouterFetchMock).not.toHaveBeenCalled();
  });
  it("prices a report from the live catalog", async () => {
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    const cost = await resolveCostRubFromUsage(
      { promptTokens: 70_000, completionTokens: 25_000 },
      "openai/gpt-5.6-luna"
    );

    // (70000 * 1e-7 + 25000 * 6e-7) USD * 90 ₽/$ = 1.98 ₽
    expect(cost.source).toBe("openrouter");
    expect(cost.rub).toBeCloseTo(1.98, 2);
  });

  it("honours OPENROUTER_USD_RUB", async () => {
    process.env.OPENROUTER_USD_RUB = "100";
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    const cost = await resolveCostRubFromUsage(
      { promptTokens: 70_000, completionTokens: 25_000 },
      "openai/gpt-5.6-luna"
    );

    expect(cost.rub).toBeCloseTo(2.2, 2);
  });

  it("caches the catalog across calls", async () => {
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    await resolveCostRubFromUsage({ promptTokens: 10, completionTokens: 10 }, "openai/gpt-5.6-luna");
    await resolveCostRubFromUsage({ promptTokens: 10, completionTokens: 10 }, "openai/gpt-5.6-luna");

    expect(openRouterFetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves routing suffixes to the base model row", async () => {
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    const cost = await resolveCostRubFromUsage(
      { promptTokens: 70_000, completionTokens: 25_000 },
      "openai/gpt-5.6-luna:nitro"
    );

    expect(cost.source).toBe("openrouter");
    expect(cost.rub).toBeCloseTo(1.98, 2);
  });

  it("keeps cost unavailable when the catalog is unreachable", async () => {
    openRouterFetchMock.mockRejectedValue(new Error("proxy down"));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    const cost = await resolveCostRubFromUsage(
      { promptTokens: 70_000, completionTokens: 25_000 },
      "deepseek/deepseek-chat-v3-0324"
    );

    expect(cost.source).toBe("unavailable");
    expect(cost.rub).toBeNull();
  });

  it("keeps cost unavailable for a model missing from the catalog", async () => {
    openRouterFetchMock.mockResolvedValue(catalogResponse(CATALOG));
    const { resolveCostRubFromUsage } = await import("@/lib/hd-report-pipeline/cost");

    const cost = await resolveCostRubFromUsage(
      { promptTokens: 1000, completionTokens: 1000 },
      "broken/no-pricing"
    );

    expect(cost.source).toBe("unavailable");
    expect(cost.rub).toBeNull();
  });
});
