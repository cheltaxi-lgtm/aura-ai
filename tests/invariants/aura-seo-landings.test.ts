/**
 * Aura SEO family: unique copy, product CTA, sitemap, no empty photo plate claims.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AURA_CHAKRA_SEO,
  AURA_COLOR_SEO,
  AURA_INTENT_SEO,
  AURA_LAYER_SEO,
  AURA_SEO_CRUMBS,
  getAllAuraSeoPaths,
} from "@/lib/seo/aura-content";
import { getAllSeoArticleSlugs } from "@/lib/seo/articles";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("aura-seo-landings", () => {
  it("every color/chakra/layer/intent has unique title, intro and FAQ", () => {
    const entries = [...AURA_COLOR_SEO, ...AURA_CHAKRA_SEO, ...AURA_LAYER_SEO, ...AURA_INTENT_SEO];
    const titles = new Set(entries.map((e) => e.title));
    const intros = new Set(entries.map((e) => e.intro));
    expect(titles.size).toBe(entries.length);
    expect(intros.size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.metaDescription.length).toBeGreaterThan(80);
      expect(entry.intro.length).toBeGreaterThan(160);
      expect(entry.sections.length).toBeGreaterThan(0);
      expect(entry.related.some((r) => r.href === "/aura")).toBe(true);
    }
  });

  it("sitemap lists aura hubs, intents and programmatic leaves", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('staticPage("/aura"');
    expect(sitemap).toContain('staticPage("/aura/cveta"');
    expect(sitemap).toContain("AURA_COLOR_SEO.map");
    expect(sitemap).toContain("AURA_CHAKRA_SEO.map");
    expect(sitemap).toContain("AURA_LAYER_SEO.map");
    expect(sitemap).toContain("AURA_INTENT_SEO.map");
    expect(getAllAuraSeoPaths().length).toBeGreaterThan(30);
  });

  it("product landing links the SEO family and does not promise photo storage", () => {
    const landing = read("src/app/aura/page.tsx");
    expect(landing).toContain('href="/aura/cveta"');
    expect(landing).toContain('href="/aura/chakry"');
    expect(landing).toContain('href="/aura/sloi"');
    expect(landing).toContain("не сохраняется");
    expect(landing).toContain("breadcrumbs={AURA_SEO_CRUMBS}");
    expect(landing).not.toContain("SeoBreadcrumbs");
  });

  it("hubs and leaves share the /gadanie trail with the product landing", () => {
    expect(AURA_SEO_CRUMBS.map((c) => c.path)).toEqual(["/", "/gadanie", "/aura"]);
    for (const rel of [
      "src/app/aura/cveta/page.tsx",
      "src/app/aura/cveta/[slug]/page.tsx",
      "src/app/aura/chakry/page.tsx",
      "src/app/aura/chakry/[slug]/page.tsx",
      "src/app/aura/sloi/page.tsx",
      "src/app/aura/sloi/[slug]/page.tsx",
      "src/app/aura/[intent]/page.tsx",
    ]) {
      expect(read(rel)).toContain("...AURA_SEO_CRUMBS");
    }
  });

  it("articles and IndexNow include aura pillars", () => {
    const slugs = getAllSeoArticleSlugs();
    expect(slugs).toContain("kak-uznat-cvet-aury-po-foto");
    expect(slugs).toContain("znachenie-cvetov-aury");
    const post = read("scripts/post-deploy-seo.mjs");
    expect(post).toContain("${base}/aura");
    expect(post).toContain("kak-uznat-cvet-aury-po-foto");
    const recrawl = read("scripts/yandex-indexing-audit.mjs");
    expect(recrawl).toContain("${base}/aura");
  });

  it("admin product stats cover aura spends and snapshots", () => {
    const stats = read("src/lib/admin-product-stats.ts");
    expect(stats).toContain("AURA_READING");
    expect(stats).toContain("aura_guest_snapshots");
    const nav = read("src/components/admin/AdminShell.tsx");
    expect(nav).toContain('href: "/admin/products"');
    const products = read("src/app/admin/products/page.tsx");
    expect(products).toContain("data ? spend30 : \"—\"");
    expect(products).not.toContain("spend30 || \"—\"");
  });
});
