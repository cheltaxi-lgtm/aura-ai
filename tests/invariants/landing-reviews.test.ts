/**
 * Landing reviews: editorial seed stays conversational, user posts are
 * sanitized and stay pending until admin approval.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_REVIEW_SEEDS } from "@/lib/landing-reviews-seed";
import {
  LANDING_REVIEW_BODY_MAX,
  LANDING_REVIEW_BODY_MIN,
  formatLandingReviewWhen,
} from "@/lib/landing-reviews-shared";
import {
  parseReviewRating,
  sanitizeReviewBody,
  sanitizeReviewCity,
  sanitizeReviewName,
  validateReviewSubmission,
} from "@/lib/landing-reviews";

const VALID_BODY =
  "Спрашивала про работу и получила спокойный разбор без обещаний. Этого хватило, чтобы не ходить кругами.";

describe("landing reviews", () => {
  it("seeds 72 unique conversational reviews without marketplace superlatives", () => {
    expect(LANDING_REVIEW_SEEDS).toHaveLength(72);
    const keys = LANDING_REVIEW_SEEDS.map((seed) => seed.key);
    expect(new Set(keys).size).toBe(72);
    const joined = LANDING_REVIEW_SEEDS.map((seed) => seed.body).join("\n");
    expect(joined).not.toMatch(/реальн(ые|ый|ых) (покупател|отзыв)/i);
    expect(joined).not.toMatch(/лучший сервис/i);
    expect(joined).not.toMatch(/100%/);
    for (const seed of LANDING_REVIEW_SEEDS) {
      expect(seed.body.length).toBeGreaterThanOrEqual(LANDING_REVIEW_BODY_MIN);
      expect(seed.body.length).toBeLessThanOrEqual(LANDING_REVIEW_BODY_MAX);
      expect([3, 4, 5]).toContain(seed.rating);
      const parsed = validateReviewSubmission({
        name: seed.name,
        body: seed.body,
        rating: seed.rating,
        product: seed.product,
      });
      expect(parsed.ok, seed.key).toBe(true);
    }
    const threes = LANDING_REVIEW_SEEDS.filter((seed) => seed.rating === 3);
    expect(threes.length).toBeGreaterThanOrEqual(3);
    expect(threes.length).toBeLessThan(12);
  });

  it("strips tags, links and emails from user copy", () => {
    expect(sanitizeReviewName("  <b>Анна</b>  ")).toBe("Анна");
    expect(sanitizeReviewBody("Пишите на test@example.com и https://spam.example сейчас.")).not.toMatch(
      /https?:|@/
    );
    expect(sanitizeReviewCity("https://spam.example Казань")).toBe("Казань");
  });

  it("rejects short, nameless or unrated submissions", () => {
    expect(
      validateReviewSubmission({ name: "А", body: VALID_BODY, rating: 5, product: "tarot" }).ok
    ).toBe(false);
    expect(
      validateReviewSubmission({ name: "Анна", body: "коротко", rating: 5, product: "tarot" }).ok
    ).toBe(false);
    expect(
      validateReviewSubmission({ name: "Анна", body: VALID_BODY, rating: null, product: "tarot" }).ok
    ).toBe(false);
    expect(parseReviewRating(6)).toBeNull();
    expect(parseReviewRating(5)).toBe(5);
    expect(
      validateReviewSubmission({ name: "Анна", body: VALID_BODY, rating: 5, product: "spam" })
    ).toEqual({ ok: false, error: "product_invalid" });
  });

  it("formats recent dates in Russian without UTC-offset math", () => {
    const now = new Date("2026-08-29T18:00:00+03:00");
    expect(formatLandingReviewWhen(now.toISOString(), now)).toBe("сегодня");
    expect(
      formatLandingReviewWhen(new Date(now.getTime() - 86_400_000).toISOString(), now)
    ).toBe("вчера");
    expect(formatLandingReviewWhen("2026-08-01T12:00:00+03:00", now)).toMatch(/авг/i);
  });

  it("keeps review browsing middleware-public (POST enforces account access in the route)", () => {
    const mw = readFileSync(path.join(__dirname, "../../src/middleware.ts"), "utf8");
    expect(mw).toContain('"/api/reviews"');
  });
});
