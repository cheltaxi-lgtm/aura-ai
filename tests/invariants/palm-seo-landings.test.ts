/**
 * Palm SEO family: unique copy, product CTA, sitemap, no photo storage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PALM_LINE_SEO,
  PALM_MOUNT_SEO,
  PALM_SEO_CRUMBS,
  PALM_SHAPE_SEO,
  getAllPalmSeoPaths,
} from "@/lib/seo/palm-content";
import { getAllSeoArticleSlugs } from "@/lib/seo/articles";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("palm-seo-landings", () => {
  it("every line/mount/shape has unique title and intro plus product CTA", () => {
    const entries = [...PALM_LINE_SEO, ...PALM_MOUNT_SEO, ...PALM_SHAPE_SEO];
    const titles = new Set(entries.map((e) => e.title));
    const intros = new Set(entries.map((e) => e.intro));
    expect(titles.size).toBe(entries.length);
    expect(intros.size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.metaDescription.length).toBeGreaterThan(40);
      expect(entry.intro.length).toBeGreaterThan(20);
      expect(entry.sections.length).toBeGreaterThan(0);
      expect(entry.related.some((r) => r.href === "/gadanie-po-ladoni")).toBe(true);
    }
  });

  it("sitemap lists palm hubs and programmatic leaves behind the kill-switch", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain("isPalmReadingEnabled()");
    expect(sitemap).toContain('staticPage("/gadanie-po-ladoni"');
    expect(sitemap).toContain('staticPage("/gadanie-po-ladoni/linii"');
    expect(sitemap).toContain("PALM_LINE_SEO.map");
    expect(sitemap).toContain("PALM_MOUNT_SEO.map");
    expect(sitemap).toContain("PALM_SHAPE_SEO.map");
    expect(getAllPalmSeoPaths().length).toBeGreaterThan(10);
  });

  it("product landing links the SEO family and does not promise photo storage", () => {
    const landing = read("src/app/gadanie-po-ladoni/page.tsx");
    expect(landing).toContain('href="/gadanie-po-ladoni/linii"');
    expect(landing).toContain('href="/gadanie-po-ladoni/kholmy"');
    expect(landing).toContain('href="/gadanie-po-ladoni/tipy-ruk"');
    expect(landing).toContain("не сохраняется");
    expect(landing).toContain("breadcrumbs={PALM_SEO_CRUMBS}");
    expect(landing).not.toContain("SeoBreadcrumbs");
  });

  it("hubs and leaves share the /gadanie trail with the product landing", () => {
    expect(PALM_SEO_CRUMBS.map((c) => c.path)).toEqual([
      "/",
      "/gadanie",
      "/gadanie-po-ladoni",
    ]);
    for (const rel of [
      "src/app/gadanie-po-ladoni/linii/page.tsx",
      "src/app/gadanie-po-ladoni/linii/[slug]/page.tsx",
      "src/app/gadanie-po-ladoni/kholmy/page.tsx",
      "src/app/gadanie-po-ladoni/kholmy/[slug]/page.tsx",
      "src/app/gadanie-po-ladoni/tipy-ruk/page.tsx",
      "src/app/gadanie-po-ladoni/tipy-ruk/[slug]/page.tsx",
    ]) {
      expect(read(rel)).toContain("...PALM_SEO_CRUMBS");
    }
    for (const rel of [
      "src/app/gadanie-po-ladoni/linii/page.tsx",
      "src/app/gadanie-po-ladoni/kholmy/page.tsx",
      "src/app/gadanie-po-ladoni/tipy-ruk/page.tsx",
    ]) {
      expect(read(rel)).toContain("Снять ладонь");
    }
  });

  it("articles and IndexNow include palm pillars", () => {
    const slugs = getAllSeoArticleSlugs();
    expect(slugs).toContain("kak-gadat-po-ladoni-po-foto");
    expect(slugs).toContain("linii-na-ladoni-znachenie");
    expect(slugs).toContain("khiromantiya-i-medicina");
    const post = read("scripts/post-deploy-seo.mjs");
    expect(post).toContain("palmAbsoluteUrls");
    expect(read("src/lib/seo/articles-palm.ts")).toContain("kak-gadat-po-ladoni-po-foto");
    const recrawl = read("scripts/yandex-indexing-audit.mjs");
    expect(recrawl).toContain("palmAbsoluteUrls");
    const deploy = read("scripts/deploy-prod.sh");
    expect(deploy).toContain("post-deploy-seo.mjs");
  });

  it("Yandex recrawl helper matches the product palm SEO family", async () => {
    const { getPalmSeoPaths, getPalmArticlePaths } = await import(
      "../../scripts/lib/palm-seo-urls.mjs"
    );
    expect(getPalmSeoPaths()).toEqual(getAllPalmSeoPaths());
    expect(getPalmArticlePaths()).toEqual([
      "/statyi/kak-gadat-po-ladoni-po-foto",
      "/statyi/linii-na-ladoni-znachenie",
      "/statyi/khiromantiya-i-medicina",
    ]);
  });

  it("aliases stay separate from tarot guest receipt", () => {
    const aliases = read("src/lib/seo/canonical-aliases.ts");
    expect(aliases).toContain('"/khiromantiya": "/gadanie-po-ladoni"');
    expect(aliases).toContain('"/chiromantiya": "/gadanie-po-ladoni"');
    expect(aliases).toContain('"/ladon": "/gadanie-po-ladoni"');
    const middleware = read("src/middleware.ts");
    expect(middleware).toContain("palmReadingEnabled");
  });

  it("product landing is photo-first and does not ship a schematic hand hero", () => {
    const landing = read("src/app/gadanie-po-ladoni/page.tsx");
    const flow = read("src/components/palm/PalmReadingFlow.tsx");
    expect(landing).toContain("Гадание по ладони");
    expect(landing).toContain("<PalmReadingFlow");
    expect(flow).toContain("Сфотографировать ладонь");
    expect(flow).toContain("Загрузить фото");
    expect(flow).toContain("Использовать это фото");
    expect(flow).toContain("Выбрать другое");
    expect(flow).toContain("PalmPhotoStage");
    expect(flow).not.toContain("PalmSilhouette");
    expect(flow).not.toContain("LINE_PATHS");
  });

  it("admin product stats cover palm spends", () => {
    const stats = read("src/lib/admin-product-stats.ts");
    expect(stats).toContain("PALM_READING");
    expect(stats).toContain("palm_reading");
  });
});
