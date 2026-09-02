/**
 * Palm SEO family: unique copy, product CTA, sitemap, no photo storage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PALM_INTENT_SEO,
  PALM_LINE_SEO,
  PALM_MARK_SEO,
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
  it("every line/mount/shape/mark/intent has unique title and intro plus product CTA", () => {
    const entries = [
      ...PALM_LINE_SEO,
      ...PALM_MOUNT_SEO,
      ...PALM_SHAPE_SEO,
      ...PALM_MARK_SEO,
      ...PALM_INTENT_SEO,
    ];
    const titles = new Set(entries.map((e) => e.title));
    const intros = new Set(entries.map((e) => e.intro));
    expect(titles.size).toBe(entries.length);
    expect(intros.size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.metaDescription.length).toBeGreaterThan(80);
      expect(entry.intro.length).toBeGreaterThan(160);
      expect(entry.sections.length).toBeGreaterThan(0);
      expect(entry.related.some((r) => r.href === "/gadanie-po-ladoni")).toBe(true);
    }
  });

  it("sitemap lists palm hubs, intents and programmatic leaves behind the kill-switch", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain("isPalmReadingEnabled()");
    expect(sitemap).toContain('staticPage("/gadanie-po-ladoni"');
    expect(sitemap).toContain('staticPage("/gadanie-po-ladoni/linii"');
    expect(sitemap).toContain('staticPage("/gadanie-po-ladoni/znaki"');
    expect(sitemap).toContain("PALM_LINE_SEO.map");
    expect(sitemap).toContain("PALM_MOUNT_SEO.map");
    expect(sitemap).toContain("PALM_SHAPE_SEO.map");
    expect(sitemap).toContain("PALM_MARK_SEO.map");
    expect(sitemap).toContain("PALM_INTENT_SEO.map");
    expect(getAllPalmSeoPaths().length).toBeGreaterThan(30);
  });

  it("product landing links the SEO family and does not promise photo storage", () => {
    const landing = read("src/app/gadanie-po-ladoni/page.tsx");
    expect(landing).toContain('href="/gadanie-po-ladoni/linii"');
    expect(landing).toContain('href="/gadanie-po-ladoni/kholmy"');
    expect(landing).toContain('href="/gadanie-po-ladoni/tipy-ruk"');
    expect(landing).toContain('href="/gadanie-po-ladoni/znaki"');
    expect(landing).toContain('href="/gadanie-po-ladoni/po-foto"');
    expect(landing).toContain('href="/gadanie-po-ladoni/lyubov"');
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
      "src/app/gadanie-po-ladoni/znaki/page.tsx",
      "src/app/gadanie-po-ladoni/znaki/[slug]/page.tsx",
      "src/app/gadanie-po-ladoni/[intent]/page.tsx",
    ]) {
      expect(read(rel)).toContain("...PALM_SEO_CRUMBS");
    }
    for (const rel of [
      "src/app/gadanie-po-ladoni/linii/page.tsx",
      "src/app/gadanie-po-ladoni/kholmy/page.tsx",
      "src/app/gadanie-po-ladoni/tipy-ruk/page.tsx",
      "src/app/gadanie-po-ladoni/znaki/page.tsx",
    ]) {
      expect(read(rel)).toContain("Снять ладонь");
    }
  });

  it("articles and IndexNow include palm pillars", () => {
    const slugs = getAllSeoArticleSlugs();
    expect(slugs).toContain("kak-gadat-po-ladoni-po-foto");
    expect(slugs).toContain("linii-na-ladoni-znachenie");
    expect(slugs).toContain("khiromantiya-i-medicina");
    expect(slugs).toContain("levaya-i-pravaya-ladon");
    expect(slugs).toContain("gadat-po-ladoni-na-lyubov");
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
      "/statyi/levaya-i-pravaya-ladon",
      "/statyi/kholmy-ladoni-znachenie",
      "/statyi/tipy-ruk-v-khiromantii",
      "/statyi/znaki-na-ladoni",
      "/statyi/gadat-po-ladoni-na-lyubov",
    ]);
  });

  it("aliases stay separate from tarot guest receipt", () => {
    const aliases = read("src/lib/seo/canonical-aliases.ts");
    expect(aliases).toContain('"/khiromantiya": "/gadanie-po-ladoni"');
    expect(aliases).toContain('"/chiromantiya": "/gadanie-po-ladoni"');
    expect(aliases).toContain('"/ladon": "/gadanie-po-ladoni"');
    expect(aliases).toContain('"/gadanie-po-ladoni-po-foto": "/gadanie-po-ladoni/po-foto"');
    expect(aliases).toContain('"/levaya-ladon": "/gadanie-po-ladoni/levaya"');
    const middleware = read("src/middleware.ts");
    expect(middleware).toContain("palmReadingEnabled");
  });

  it("Metrika manifest covers palm funnel and SEO views", () => {
    const goals = read("scripts/metrika-goals.json");
    for (const id of [
      "palm_landing_view",
      "palm_snapshot_start",
      "palm_paid_cta",
      "palm_seo_cta",
      "palm_line_view",
      "palm_mark_view",
      "palm_intent_view",
    ]) {
      expect(goals).toContain(`"id": "${id}"`);
    }
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

  it("does not invent a marriage-line product page", () => {
    const content = read("src/lib/seo/palm-content.ts");
    expect(content).toContain("линии брака");
    expect(content).not.toContain("/gadanie-po-ladoni/linii/braka");
  });
});
