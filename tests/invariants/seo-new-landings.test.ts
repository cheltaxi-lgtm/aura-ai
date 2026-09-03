/**
 * New commercial SEO landings (Sep 2026): карта дня, бесплатно,
 * гороскоп на сегодня, число пути, Ленорман/руны на любовь.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_ALIASES } from "@/lib/seo/canonical-aliases";
import { lifePathNumber } from "@/lib/numerology/calculator";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const LANDINGS = [
  {
    file: "src/app/gadanie/karta-dnya/page.tsx",
    path: "/gadanie/karta-dnya",
    title: "Карта дня онлайн — одна карта и 3 карты дня",
    h1: "Карта дня онлайн",
  },
  {
    file: "src/app/gadanie/besplatno/page.tsx",
    path: "/gadanie/besplatno",
    title: "Что входит в бесплатное гадание онлайн",
    h1: "Что входит в бесплатное гадание онлайн",
  },
  {
    file: "src/app/goroskop-na-segodnya/page.tsx",
    path: "/goroskop-na-segodnya",
    title: "Гороскоп на сегодня — знак зодиака и натальная карта",
    h1: "Гороскоп на сегодня",
  },
  {
    file: "src/app/numerology/chislo-sudby/page.tsx",
    path: "/numerology/chislo-sudby",
    title: "Число судьбы по дате рождения — рассчитать бесплатно",
    h1: "Число судьбы по дате рождения",
  },
  {
    file: "src/app/lenormand/na-lyubov/page.tsx",
    path: "/lenormand/na-lyubov",
    title: "Ленорман на любовь — расклад онлайн",
    h1: "Ленорман на любовь",
  },
  {
    file: "src/app/runy/na-lyubov/page.tsx",
    path: "/runy/na-lyubov",
    title: "Руны на любовь — гадание онлайн",
    h1: "Руны на любовь",
  },
] as const;

describe("seo-new-landings", () => {
  it("each landing has unique title, H1, breadcrumbs and FAQ JSON-LD", () => {
    const titles = new Set<string>();
    const h1s = new Set<string>();
    for (const page of LANDINGS) {
      const src = read(page.file);
      expect(src, page.path).toContain(`path: "${page.path}"`);
      expect(src, page.path).toContain(page.title);
      expect(src, page.path).toContain(page.h1);
      expect(src, page.path).toMatch(/breadcrumbs/);
      expect(src, page.path).toMatch(/buildForecastStructuredData/);
      expect(src, page.path).not.toMatch(/noIndex:\s*true/);
      titles.add(page.title);
      h1s.add(page.h1);
    }
    expect(titles.size).toBe(LANDINGS.length);
    expect(h1s.size).toBe(LANDINGS.length);
    const hub = read("src/app/gadanie/page.tsx");
    expect(hub).toContain(">Гадание онлайн бесплатно<");
    expect(read("src/app/gadanie/besplatno/page.tsx")).not.toContain(
      ">Гадание онлайн бесплатно<"
    );
  });

  it("sitemap lists the new commercial hubs", () => {
    const sitemap = read("src/app/sitemap.ts");
    for (const page of LANDINGS) {
      expect(sitemap, page.path).toContain(`staticPage("${page.path}"`);
    }
    expect(sitemap).toContain('staticPage("/numerology/detskaya-matritsa"');
  });

  it("canonical aliases consolidate duplicate keyword paths", () => {
    expect(CANONICAL_ALIASES["/karta-dnya"]).toBe("/gadanie/karta-dnya");
    expect(CANONICAL_ALIASES["/gadanie-besplatno"]).toBe("/gadanie/besplatno");
    expect(CANONICAL_ALIASES["/goroskop"]).toBe("/goroskop-na-segodnya");
    expect(CANONICAL_ALIASES["/chislo-sudby"]).toBe("/numerology/chislo-sudby");
    expect(CANONICAL_ALIASES["/gadanie-po-foto"]).toBe("/photo-rasklad");
    expect(CANONICAL_ALIASES["/lenormand-na-lyubov"]).toBe("/lenormand/na-lyubov");
    expect(CANONICAL_ALIASES["/runy-na-lyubov"]).toBe("/runy/na-lyubov");
    expect(CANONICAL_ALIASES["/goroskop-rozhdeniya"]).toBe("/natalnaya-karta");
  });

  it("карта дня does not sell the guest triplet as daily cards", () => {
    const src = read("src/app/gadanie/karta-dnya/page.tsx");
    expect(src).toContain("/?ask=1&spread=1");
    expect(src).toContain("Попробовать первый расклад");
    expect(src).not.toMatch(/href="\/\?ask=1&spread=1"[\s\S]{0,80}карта дня/i);
    expect(src).toContain("не «карта дня»");
    expect(src).toContain("/rasklady/karta-dnya");
  });

  it("life-path calculator uses the shared engine and does not persist a receipt", () => {
    const preview = read("src/components/numerolog/LifePathPreview.tsx");
    expect(preview).toContain("lifePathNumber");
    expect(preview).not.toMatch(/localStorage\.|sessionStorage\.|guest_resume|claimToken/);
    const result = lifePathNumber("1990-01-01");
    expect(result.number).toBeGreaterThan(0);
    expect(result.title).toBeTruthy();
  });
});
