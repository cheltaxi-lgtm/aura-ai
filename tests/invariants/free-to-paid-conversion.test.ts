/**
 * P2.5: free public result → one existing paid next step.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING } from "@/lib/config/pricing";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { sanitizeProductFunnelParams } from "@/lib/seo/product-funnel";
import {
  FREE_TO_PAID,
  freeToPaidCtaLabel,
  freeToPaidFunnelState,
  freeToPaidHint,
} from "@/lib/free-to-paid-conversion";
import { resolveCrossProductRecommendations } from "@/lib/cross-product-recommendations";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("free-to-paid-conversion", () => {
  it("maps each free result to an existing paid product and live price", () => {
    expect(FREE_TO_PAID.matrix.runeAction).toBe("NUMEROLOGY_SESSION");
    expect(FREE_TO_PAID.matrix.cost).toBe(PRICING.NUMEROLOGY_SESSION);
    expect(FREE_TO_PAID.matrix_pair.runeAction).toBe("MATRIX_PAIR_REPORT");
    expect(FREE_TO_PAID.matrix_pair.cost).toBe(PRICING.MATRIX_PAIR_REPORT);
    expect(FREE_TO_PAID.natal.runeAction).toBe("NATAL_READING");
    expect(FREE_TO_PAID.natal.cost).toBe(DEFAULT_RUNE_COSTS.NATAL_READING);
    expect(FREE_TO_PAID.human_design.runeAction).toBe("HD_REPORT");
    expect(FREE_TO_PAID.human_design.cost).toBe(DEFAULT_RUNE_COSTS.HD_REPORT);
  });

  it("owned → open, not-owned → purchase copy", () => {
    expect(freeToPaidCtaLabel(FREE_TO_PAID.matrix, false)).toBe(
      "Получить полный разбор Матрицы"
    );
    expect(freeToPaidCtaLabel(FREE_TO_PAID.matrix, true)).toBe("Открыть полный разбор");
    expect(freeToPaidCtaLabel(FREE_TO_PAID.matrix_pair, false)).toBe(
      "Разобрать отношения подробно"
    );
    expect(freeToPaidCtaLabel(FREE_TO_PAID.natal, true)).toBe("Открыть полный разбор");
    expect(freeToPaidFunnelState(true)).toBe("owned");
    expect(freeToPaidFunnelState(false)).toBe("new");
    expect(freeToPaidHint(FREE_TO_PAID.matrix, false)).toMatch(/Эвелин/);
    expect(freeToPaidHint(FREE_TO_PAID.matrix, true)).toMatch(/уже куплен/);
  });

  it("does not invent generic unlock copy or client entitlement flags", () => {
    const blob = Object.values(FREE_TO_PAID)
      .flatMap((s) => [s.buyLabel, s.openLabel, s.buyHint, s.openHint])
      .join("\n");
    expect(blob).not.toMatch(/Разблокировать|Получить инсайты|Премиум анализ/i);

    const matrix = read("src/components/numerolog/DestinyMatrixPreview.tsx");
    const pair = read("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    const natal = read("src/components/natal/NatalGuestCalculator.tsx");
    const hd = read("src/components/human-design/HdReportPanel.tsx");
    for (const src of [matrix, pair, natal, hd]) {
      expect(src).not.toMatch(/localStorage.*owned|billingExempt|isFree\s*:/);
      expect(src).toMatch(/paid_cta/);
      expect(src).toMatch(/FREE_TO_PAID/);
    }
  });

  it("paid CTA is after the free result, not before the form", () => {
    const matrix = read("src/components/numerolog/DestinyMatrixPreview.tsx");
    expect(matrix.indexOf("summary.denseTeaser")).toBeLessThan(
      matrix.indexOf("void openFullMatrix()")
    );
    const pair = read("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    expect(pair.indexOf("preview.score")).toBeLessThan(pair.indexOf("void openFullReport()"));
    const natal = read("src/components/natal/NatalGuestCalculator.tsx");
    expect(natal.indexOf("result.highlights")).toBeLessThan(natal.indexOf("FREE_TO_PAID.natal"));
    const hdCalc = read("src/components/human-design/HdCalculator.tsx");
    expect(hdCalc.indexOf("HdChartView")).toBeLessThan(hdCalc.indexOf("HdReportPanel"));
  });

  it("guest continuity return paths stay on the same artifact routes", () => {
    const matrix = read("src/components/numerolog/DestinyMatrixPreview.tsx");
    const pair = read("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    const natal = read("src/components/natal/NatalGuestCalculator.tsx");
    expect(matrix).toMatch(/resumeMatrix=1/);
    expect(pair).toMatch(/resumePair=1/);
    expect(natal).toMatch(/resumeNatal=1/);
    expect(matrix).toMatch(/matrix-claim|persistGuestMatrix/);
    expect(pair).toMatch(/matrix-pair-claim|persistPair/);
    expect(natal).toMatch(/natal-chart\/claim/);
    expect(natal).toMatch(/natal-chart\/interpretation-owned\?artifactId=/);
    expect(natal).not.toMatch(/\/api\/natal-chart\/history\?limit=/);
  });

  it("MATRIX_PAIR_REPORT stays a paid rune action; pair CTA uses server ownership", () => {
    expect(PRICING.MATRIX_PAIR_REPORT).toBe(DEFAULT_RUNE_COSTS.MATRIX_PAIR_REPORT);
    expect(PRICING.MATRIX_PAIR_REPORT).toBe(30);
    const pair = read("src/components/numerolog/MatrixCompatibilityPreview.tsx");
    expect(pair).toMatch(/matrix-pair-owned\?pendingId=/);
    expect(pair).not.toMatch(/\/api\/numerology\/matrix-report\?birthDate=/);
    const route = read("src/app/api/numerology/matrix-pair-owned/route.ts");
    expect(route).toMatch(/requireProfileUserId/);
    expect(route).toMatch(/hasOwnedMatrixPairForPending/);
    expect(route).toMatch(/return NextResponse\.json\(\{ owned \}\)/);
  });

  it("cross-product list does not duplicate the pair paid CTA", () => {
    const pair = resolveCrossProductRecommendations("matrix_compatibility");
    expect(pair.map((i) => i.product)).not.toContain("matrix_compatibility");
    expect(pair.map((i) => i.id)).not.toContain("pair_full");
  });

  it("paid_cta analytics stays product/source/state without PII", () => {
    const clean = sanitizeProductFunnelParams({
      product: "matrix_compatibility",
      source: "pair_full",
      state: "owned",
      userId: "u1",
      birthDate: "1990-01-01",
      email: "a@b.c",
      artifactId: "art-1",
      question: "вернётся ли он",
    });
    expect(clean).toEqual({
      product: "matrix_compatibility",
      source: "pair_full",
      state: "owned",
    });
    expect(JSON.stringify(clean)).not.toMatch(/u1|1990|a@b|art-1|верн/i);
  });

  it("Tarot P0 guest path is untouched", () => {
    const guest = read("src/components/GuestTripletDraw.tsx");
    expect(guest).not.toMatch(/FREE_TO_PAID|free-to-paid-conversion/);
    const reading = read("src/app/api/reading/route.ts");
    expect(reading).toMatch(/resolveGuestResumeFreeReading/);
    expect(reading).not.toMatch(/body\s*\.\s*isFree\b/);
  });
});
