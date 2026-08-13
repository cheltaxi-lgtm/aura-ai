/**
 * P2.2: multiproduct SEO — sitemap, canonicals, unique meta, internal links.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("multiproduct-seo-discoverability", () => {
  it("sitemap lists core public product routes", () => {
    const sitemap = read("src/app/sitemap.ts");
    for (const route of [
      '"/"',
      '"/numerology/destiny-matrix"',
      '"/numerology/matrica-sovmestimosti"',
      '"/natalnaya-karta"',
      '"/dizayn-cheloveka/rasschitat"',
      '"/taro"',
    ]) {
      expect(sitemap, route).toContain(`staticPage(${route}`);
    }
  });

  it("robots allows crawl and points to sitemap; product paths not disallowed", () => {
    const robots = read("src/app/robots.txt/route.ts");
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Sitemap:.*\/sitemap\.xml/);
    expect(robots).not.toMatch(/Disallow: \/numerology/);
    expect(robots).not.toMatch(/Disallow: \/natalnaya/);
    expect(robots).not.toMatch(/Disallow: \/dizayn-cheloveka\/rasschitat/);
    expect(robots).not.toMatch(/Disallow: \/taro/);
  });

  it("product pages have unique titles/descriptions and indexable canonicals", () => {
    const pages = [
      {
        path: "/",
        title: "Матрица судьбы, Натальная карта, Дизайн человека и Таро",
        description:
          "Zovus — персональные AI-разборы и расчёты: матрица судьбы, натальная карта, дизайн человека и Таро",
        file: "src/app/page.tsx",
      },
      {
        path: "/numerology/destiny-matrix",
        title: "Полная матрица судьбы по дате рождения",
        description: "Полная матрица судьбы онлайн бесплатно",
        file: "src/app/numerology/[slug]/page.tsx",
      },
      {
        path: "/numerology/matrica-sovmestimosti",
        title: "Совместимость матриц судьбы",
        description: "Бесплатный расчёт совместимости по матрице судьбы",
        file: "src/app/numerology/[slug]/page.tsx",
      },
      {
        path: "/natalnaya-karta",
        title: "Натальная карта онлайн — расчёт и расшифровка",
        description: "Натальная карта по дате, времени и месту рождения",
        file: "src/app/natalnaya-karta/page.tsx",
      },
      {
        path: "/dizayn-cheloveka/rasschitat",
        title: "Рассчитать карту Дизайна Человека бесплатно",
        description: "Бесплатный онлайн-калькулятор Дизайна Человека",
        file: "src/app/dizayn-cheloveka/rasschitat/page.tsx",
      },
      {
        path: "/taro",
        title: "Таро онлайн — расклады, значения карт и бесплатное гадание",
        description: "Таро онлайн: расклады на отношения",
        file: "src/app/taro/page.tsx",
      },
    ];

    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const page of pages) {
      const src = read(page.file);
      expect(src).toMatch(new RegExp(page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      expect(src).toMatch(
        new RegExp(page.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
      expect(src).not.toMatch(/noIndex:\s*true/);
      expect(src).not.toMatch(/robots:\s*\{\s*index:\s*false/);

      const meta = buildSeoMetadata({
        title: page.title,
        description: page.description,
        path: page.path === "/" ? "/" : page.path,
      });
      expect(meta.alternates?.canonical).toBeTruthy();
      expect(String(meta.alternates?.canonical)).toMatch(
        page.path === "/" ? /\/?$/ : new RegExp(`${page.path.replace(/\//g, "\\/")}$`)
      );
      titles.add(page.title);
      descriptions.add(page.description);
    }

    expect(titles.size).toBe(pages.length);
    expect(descriptions.size).toBe(pages.length);
  });

  it("root metadata is multiproduct, not Tarot-only", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/Матрица судьбы.*Натальная карта.*Дизайн человека.*Таро/s);
    expect(page).not.toMatch(/absolute:\s*"Расклад Таро онлайн бесплатно/);
    const homeSeo = read("src/components/seo/HomeSeoContent.tsx");
    expect(homeSeo).toMatch(/\/numerology\/destiny-matrix/);
    expect(homeSeo).toMatch(/\/natalnaya-karta/);
    expect(homeSeo).toMatch(/\/dizayn-cheloveka\/rasschitat/);
    expect(homeSeo).toMatch(/\/taro/);
    expect(homeSeo).toMatch(/label="Свой вопрос"/);
    expect(homeSeo).toMatch(/submitLabel="Разобрать"/);
  });

  it("internal product links are present (Matrix↔Pair, Matrix↔Natal, Natal↔HD)", () => {
    const matrixPage = read("src/app/numerology/[slug]/page.tsx");
    expect(matrixPage).toMatch(/href="\/numerology\/matrica-sovmestimosti"/);
    expect(matrixPage).toMatch(/href="\/natalnaya-karta"/);
    expect(matrixPage).toMatch(/href="\/numerology\/destiny-matrix"/);
    expect(matrixPage).toMatch(/href="\/dizayn-cheloveka\/rasschitat"/);

    const natal = read("src/app/natalnaya-karta/page.tsx");
    expect(natal).toMatch(/href:\s*"\/numerology\/destiny-matrix"/);
    expect(natal).toMatch(/href:\s*"\/dizayn-cheloveka\/rasschitat"/);
    expect(natal).toMatch(/href="\/dizayn-cheloveka\/rasschitat"/);

    const hd = read("src/app/dizayn-cheloveka/rasschitat/page.tsx");
    expect(hd).toMatch(/href: "\/natalnaya-karta"/);
    expect(hd).toMatch(/href: "\/numerology\/destiny-matrix"/);
  });

  it("matrix/pair/natal/hd reuse FAQ or breadcrumb structured data where content exists", () => {
    const matrixPage = read("src/app/numerology/[slug]/page.tsx");
    expect(matrixPage).toMatch(/buildForecastStructuredData/);
    expect(matrixPage).toMatch(/MATRIX_PAIR_FAQ/);
    expect(matrixPage).toMatch(/SeoBreadcrumbs/);

    const natal = read("src/app/natalnaya-karta/page.tsx");
    expect(natal).toMatch(/buildForecastStructuredData/);
    expect(natal).toMatch(/SeoBreadcrumbs/);

    const hd = read("src/app/dizayn-cheloveka/rasschitat/page.tsx");
    expect(hd).toMatch(/buildForecastStructuredData/);
    expect(hd).toMatch(/SeoBreadcrumbs/);
  });
});
