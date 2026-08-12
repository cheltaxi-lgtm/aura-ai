/**
 * P2.1: cross-product next steps after free public results.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSS_PRODUCT_PUBLIC_ROUTES,
  resolveCrossProductRecommendations,
  type CrossProductContext,
} from "@/lib/cross-product-recommendations";
import { sanitizeProductFunnelParams } from "@/lib/seo/product-funnel";

const ROOT = path.resolve(__dirname, "../..");

describe("cross-product-recommendations", () => {
  const contexts: CrossProductContext[] = [
    "matrix",
    "natal",
    "human_design",
    "matrix_compatibility",
  ];

  it("routes match public product pages", () => {
    expect(CROSS_PRODUCT_PUBLIC_ROUTES.matrix).toBe("/numerology/destiny-matrix");
    expect(CROSS_PRODUCT_PUBLIC_ROUTES.natal).toBe("/natalnaya-karta");
    expect(CROSS_PRODUCT_PUBLIC_ROUTES.human_design).toBe(
      "/dizayn-cheloveka/rasschitat"
    );
    expect(CROSS_PRODUCT_PUBLIC_ROUTES.matrix_compatibility).toBe(
      "/numerology/matrica-sovmestimosti"
    );
  });

  it("never self-recommends a navigation CTA; max 2 items", () => {
    const selfProduct: Record<CrossProductContext, string> = {
      matrix: "matrix",
      natal: "natal",
      human_design: "human_design",
      matrix_compatibility: "matrix_compatibility",
    };

    for (const ctx of contexts) {
      const items = resolveCrossProductRecommendations(ctx);
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(2);
      for (const item of items) {
        if (item.href) {
          expect(item.product).not.toBe(selfProduct[ctx]);
        }
      }
    }
  });

  it("matrix / natal / hd / pair catalogs match product brief", () => {
    expect(resolveCrossProductRecommendations("matrix").map((i) => i.product)).toEqual([
      "natal",
      "matrix_compatibility",
    ]);
    expect(resolveCrossProductRecommendations("natal").map((i) => i.product)).toEqual([
      "human_design",
      "matrix",
    ]);
    expect(
      resolveCrossProductRecommendations("human_design").map((i) => i.product)
    ).toEqual(["natal", "matrix"]);
    const pair = resolveCrossProductRecommendations("matrix_compatibility");
    expect(pair.map((i) => i.id)).toEqual(["matrix", "pair_full"]);
    expect(pair[1]?.action).toBe("pair_full");
  });

  it("wired after free results; Tarot P0 left untouched", () => {
    const matrix = readFileSync(
      path.join(ROOT, "src/components/numerolog/DestinyMatrixPreview.tsx"),
      "utf8"
    );
    const natal = readFileSync(
      path.join(ROOT, "src/components/natal/NatalGuestCalculator.tsx"),
      "utf8"
    );
    const hd = readFileSync(
      path.join(ROOT, "src/components/human-design/HdCalculator.tsx"),
      "utf8"
    );
    const pair = readFileSync(
      path.join(ROOT, "src/components/numerolog/MatrixCompatibilityPreview.tsx"),
      "utf8"
    );
    const guest = readFileSync(
      path.join(ROOT, "src/components/GuestTripletDraw.tsx"),
      "utf8"
    );

    expect(matrix).toMatch(/CrossProductNextSteps\s+context="matrix"/);
    expect(natal).toMatch(/CrossProductNextSteps\s+context="natal"/);
    expect(hd).toMatch(/CrossProductNextSteps\s+context="human_design"/);
    expect(pair).toMatch(/CrossProductNextSteps/);
    expect(pair).toMatch(/context="matrix_compatibility"/);
    expect(guest).not.toMatch(/CrossProductNextSteps/);
  });

  it("cross_product_click analytics uses product/source/state only", () => {
    const funnel = readFileSync(
      path.join(ROOT, "src/lib/seo/product-funnel.ts"),
      "utf8"
    );
    const ui = readFileSync(
      path.join(ROOT, "src/components/CrossProductNextSteps.tsx"),
      "utf8"
    );
    expect(funnel).toMatch(/cross_product_click/);
    expect(funnel).toMatch(/trackCrossProductClick/);
    expect(ui).toMatch(/trackCrossProductClick/);
    expect(ui).not.toMatch(/personal_explore_click/);

    const clean = sanitizeProductFunnelParams({
      product: "natal",
      source: "matrix",
      state: "natal",
      birthDate: "1990-01-01",
      userId: "u1",
      claimToken: "tok",
    });
    expect(clean).toEqual({ product: "natal", source: "matrix", state: "natal" });
    expect(JSON.stringify(clean)).not.toMatch(/1990|userId|tok/i);
  });
});
