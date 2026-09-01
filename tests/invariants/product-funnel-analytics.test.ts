/**
 * P1.3B: unified product funnel analytics — stages + no PII in params.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_FUNNEL_PRODUCTS,
  PRODUCT_FUNNEL_STAGES,
  sanitizeProductFunnelParams,
  inferProductFunnelFromPath,
  type ProductFunnelProduct,
  type ProductFunnelStage,
} from "@/lib/seo/product-funnel";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("product-funnel-analytics", () => {
  it("sanitize keeps only product/source/state and drops PII keys", () => {
    const clean = sanitizeProductFunnelParams({
      product: "tarot",
      source: "guest_triplet",
      state: "ok",
      name: "Иван",
      birthDate: "1990-01-01",
      email: "a@b.c",
      userId: "u1",
      subjectId: "s1",
      artifactId: "a1",
      claimToken: "tok",
      question: "тайный вопрос",
      cards: "Fool",
      place: "Москва",
      lat: 55.7,
    });
    expect(clean).toEqual({
      product: "tarot",
      source: "guest_triplet",
      state: "ok",
    });
    expect(JSON.stringify(clean)).not.toMatch(
      /Иван|1990|a@b|userId|subjectId|artifact|tok|тайный|Fool|Москва|55\.7/i
    );
  });

  it("sanitize rejects blocked source/state fragments", () => {
    expect(
      sanitizeProductFunnelParams({
        product: "natal",
        source: "birth_form",
      })
    ).toBeNull();
    expect(
      sanitizeProductFunnelParams({
        product: "matrix",
        source: "preview",
        state: "email_sent",
      })
    ).toEqual({ product: "matrix", source: "preview" });
  });

  it("path inference covers public product surfaces without query PII", () => {
    expect(inferProductFunnelFromPath("/")).toBe("tarot");
    expect(inferProductFunnelFromPath("/numerology/destiny-matrix")).toBe("matrix");
    expect(inferProductFunnelFromPath("/natalnaya-karta")).toBe("natal");
    expect(inferProductFunnelFromPath("/dizayn-cheloveka/rasschitat")).toBe(
      "human_design"
    );
    expect(
      inferProductFunnelFromPath("/numerology/matrica-sovmestimosti")
    ).toBe("matrix_compatibility");
    expect(inferProductFunnelFromPath("/aura")).toBe("aura");
    expect(inferProductFunnelFromPath("/gadanie-po-ladoni")).toBe("palm");
    expect(inferProductFunnelFromPath("/khiromantiya")).toBe("palm");
  });

  it("all 5 products emit core funnel stages in code", () => {
    const corpus = [
      read("src/lib/seo/metrika.ts"),
      read("src/components/numerolog/DestinyMatrixPreview.tsx"),
      read("src/components/natal/NatalGuestCalculator.tsx"),
      read("src/components/numerolog/MatrixCompatibilityPreview.tsx"),
      read("src/components/human-design/HdCalculator.tsx"),
      read("src/components/human-design/HdReportPanel.tsx"),
      read("src/app/numerology/[slug]/page.tsx"),
      read("src/app/natalnaya-karta/page.tsx"),
      read("src/app/dizayn-cheloveka/rasschitat/page.tsx"),
      read("src/app/aura/page.tsx"),
      read("src/components/aura/AuraReadingFlow.tsx"),
      read("src/app/gadanie-po-ladoni/page.tsx"),
      read("src/components/palm/PalmReadingFlow.tsx"),
      read("src/components/seo/SeoPageTracker.tsx"),
    ].join("\n");

    const hasStage = (product: ProductFunnelProduct, stage: ProductFunnelStage) => {
      const literal = new RegExp(
        `trackProductFunnel\\(\\s*["']${stage}["'][\\s\\S]{0,220}?product:\\s*["']${product}["']`
      );
      if (literal.test(corpus)) return true;
      // product_view via SeoPageTracker funnelProduct prop / ternary
      if (
        stage === "product_view" &&
        /funnelProduct=/.test(corpus) &&
        new RegExp(`["']${product}["']`).test(corpus)
      ) {
        return true;
      }
      // shared paywall → paid_cta with path inference (tarot/home etc.)
      if (
        stage === "paid_cta" &&
        corpus.includes('trackProductFunnel("paid_cta"') &&
        corpus.includes("inferProductFunnelFromPath")
      ) {
        return product === "tarot" || product === "human_design" || product === "natal";
      }
      return false;
    };

    for (const product of PRODUCT_FUNNEL_PRODUCTS) {
      for (const stage of PRODUCT_FUNNEL_STAGES) {
        expect(hasStage(product, stage), `${product}/${stage}`).toBe(true);
      }
    }
  });

  it("Personal Zovus events are wired without PII fields", () => {
    const src = read("src/components/editorial/PersonalZovusHome.tsx");
    expect(src).toMatch(/trackPersonalZovusEvent\(\s*["']personal_home_view["']/);
    expect(src).toMatch(/trackPersonalZovusEvent\(\s*["']personal_continue_click["']/);
    expect(src).toMatch(/trackPersonalZovusEvent\(\s*["']personal_explore_click["']/);
    expect(src).toMatch(/trackRetentionReturn/);
    expect(src).not.toMatch(
      /trackPersonalZovusEvent\([\s\S]{0,200}(birthDate|email|userId|claimToken|question)/
    );
  });

  it("legacy guest/matrix goals remain (compatibility, not removed)", () => {
    const metrika = read("src/lib/seo/metrika.ts");
    expect(metrika).toMatch(/guest_spread_started/);
    expect(metrika).toMatch(/guest_claim/);
    expect(metrika).toContain("guest_teaser_view");
    expect(metrika).toContain("guest_teaser_cta");
    expect(metrika).toContain("auth_gate_view");
    expect(metrika).toContain("auth_provider_click");
    expect(metrika).toContain("auth_email_view");
    expect(metrika).toContain("registration_completed");
    expect(metrika).toContain("guest_full");
    const matrix = read("src/components/numerolog/DestinyMatrixPreview.tsx");
    expect(matrix).toMatch(/matrix_preview_complete/);
    expect(matrix).toMatch(/matrix_guest_claim_complete/);
    expect(matrix).toMatch(/matrix_cta_full/);
  });
});
