/**
 * Landing reviews: only real user posts can become public after moderation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
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
  it("public list and rating exclude old fabricated seed rows", () => {
    const source = readFileSync(path.join(__dirname, "../../src/lib/landing-reviews.ts"), "utf8");
    expect(source).toContain("status = 'approved' AND source = 'user'");
    expect(source).toContain("FROM landing_reviews WHERE source = 'user' GROUP BY status");
    const route = readFileSync(path.join(__dirname, "../../src/app/api/reviews/route.ts"), "utf8");
    expect(route).not.toContain("ensureLandingReviewSeed");
    expect(readFileSync(path.join(__dirname, "../../src/app/api/admin/reviews/route.ts"), "utf8"))
      .not.toContain("ensureLandingReviewSeed");
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
