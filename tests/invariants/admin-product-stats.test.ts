import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("admin-product-stats", () => {
  it("covers every billed product and guest snapshot tables", () => {
    const stats = read("src/lib/admin-product-stats.ts");
    expect(stats).toContain("AURA_READING");
    expect(stats).toContain("PALM_READING");
    expect(stats).toContain("VISION_ANALYSIS");
    expect(stats).toContain("NUMEROLOGY_SESSION");
    expect(stats).toContain("HD_REPORT");
    expect(stats).toContain("JOINT_READING");
    expect(stats).toContain("aura_guest_snapshots");
    expect(stats).toContain("palm_guest_snapshots");
    expect(stats).toContain("Europe/Moscow");
    expect(stats).toContain("COUNT(DISTINCT user_id)");
    expect(stats).toContain("spendPrev30d");
  });

  it("admin demand page ranks products and keeps the 30-day spend gate", () => {
    const page = read("src/app/admin/products/page.tsx");
    expect(page).toContain("Что заказывают чаще");
    expect(page).toContain("data ? spend30 : \"—\"");
    expect(page).not.toContain("spend30 || \"—\"");
    expect(page).toContain("Плативших за 30 дней");
    expect(page).toContain("Списания по действию");
  });

  it("route stays admin-gated", () => {
    const route = read("src/app/api/admin/product-stats/route.ts");
    expect(route).toContain("requireAdmin()");
    expect(route).toContain("getProductSectionStats()");
  });
});
