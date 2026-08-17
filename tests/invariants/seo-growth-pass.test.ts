/**
 * SEO Growth Pass invariants (Aug 2026, Yandex Webmaster data driven).
 *
 * Locks in:
 * 1. HD hub vs calculator intent split — no title/H1 cannibalization between
 *    /dizayn-cheloveka (topic authority) and /dizayn-cheloveka/rasschitat
 *    (transactional calculator).
 * 2. Breadcrumb chains (visible + BreadcrumbList JSON-LD) on every HD
 *    programmatic page family.
 * 3. Gate ↔ channel ↔ center internal linking (programmatic graph).
 * 4. /photo-rasklad preservation: URL, title and real-functionality claims.
 * 5. zhdat-ili-zabyt CTR metadata covers the "гадание" query phrasing.
 * 6. Sitemap/robots hygiene: public families in, private/user routes out.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gateSeo, channelSeo, ALL_GATE_SLUGS, ALL_CHANNEL_SLUGS } from "@/lib/human-design/seo-entities";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("seo-growth-pass", () => {
  describe("HD hub vs calculator intent split", () => {
    it("hub is topic-first, calculator is transactional, titles and H1 differ", () => {
      const hub = read("src/app/dizayn-cheloveka/page.tsx");
      const calc = read("src/app/dizayn-cheloveka/rasschitat/page.tsx");

      // Hub owns the broad topic intent ("что это"), not the calculator query.
      expect(hub).toContain('title: "Дизайн Человека — что это:');
      expect(hub).toMatch(/Дизайн Человека: что это и как работает/);
      // Calculator owns the transactional intent.
      expect(calc).toContain('title: "Рассчитать карту Дизайна Человека бесплатно');
      expect(calc).toMatch(/Рассчитать карту Дизайна Человека/);

      // No shared H1 between the two.
      const hubH1 = hub.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
      const calcH1 = calc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
      expect(hubH1).not.toBe(calcH1);
    });

    it("hub still routes searchers into the calculator", () => {
      const hub = read("src/app/dizayn-cheloveka/page.tsx");
      expect(hub).toMatch(/href="\/dizayn-cheloveka\/rasschitat"/);
    });
  });

  describe("HD breadcrumbs (visible chain + BreadcrumbList JSON-LD)", () => {
    it("every HD programmatic page passes breadcrumbs to SeoPageShell", () => {
      const pages = [
        "src/app/dizayn-cheloveka/page.tsx",
        "src/app/dizayn-cheloveka/rasschitat/page.tsx",
        "src/app/dizayn-cheloveka/vorota/page.tsx",
        "src/app/dizayn-cheloveka/vorota/[gate]/page.tsx",
        "src/app/dizayn-cheloveka/kanaly/page.tsx",
        "src/app/dizayn-cheloveka/kanaly/[channel]/page.tsx",
        "src/app/dizayn-cheloveka/centry/page.tsx",
        "src/app/dizayn-cheloveka/centry/[center]/page.tsx",
        "src/app/dizayn-cheloveka/tipy/page.tsx",
        "src/app/dizayn-cheloveka/tipy/[type]/page.tsx",
        "src/app/dizayn-cheloveka/profili/page.tsx",
        "src/app/dizayn-cheloveka/profili/[profile]/page.tsx",
        "src/app/dizayn-cheloveka/sovmestimost/page.tsx",
        "src/app/dizayn-cheloveka/sovmestimost/rasschitat/page.tsx",
        "src/app/dizayn-cheloveka/sovmestimost/[pair]/page.tsx",
      ];
      for (const page of pages) {
        const src = read(page);
        expect(src, page).toMatch(/breadcrumbs=\{/);
        expect(src, page).toMatch(/name: "Дизайн Человека", path: "\/dizayn-cheloveka"/);
      }
    });

    it("SeoPageShell renders SeoBreadcrumbs (with JSON-LD) when breadcrumbs are given", () => {
      const shell = read("src/components/seo/SeoPageShell.tsx");
      expect(shell).toMatch(/import SeoBreadcrumbs/);
      expect(shell).toMatch(/<SeoBreadcrumbs items=\{breadcrumbs\} \/>/);
      const crumbs = read("src/components/seo/SeoBreadcrumbs.tsx");
      expect(crumbs).toMatch(/buildBreadcrumbJsonLd/);
      const builder = read("src/lib/seo/breadcrumbs.ts");
      expect(builder).toMatch(/BreadcrumbList/);
    });
  });

  describe("HD programmatic internal linking", () => {
    it("gate pages link to their channels and partner gates", () => {
      const gate = read("src/app/dizayn-cheloveka/vorota/[gate]/page.tsx");
      expect(gate).toMatch(/href=\{`\/dizayn-cheloveka\/kanaly\/\$\{channel\.key\}`\}/);
      expect(gate).toMatch(/\/dizayn-cheloveka\/vorota\/\$\{seo\.partnerGates\[i\]\}/);
    });

    it("channel pages link both gates AND both centers", () => {
      const channel = read("src/app/dizayn-cheloveka/kanaly/[channel]/page.tsx");
      expect(channel).toMatch(/\/dizayn-cheloveka\/vorota\/\$\{seo\.gates\[0\]\}/);
      expect(channel).toMatch(/\/dizayn-cheloveka\/vorota\/\$\{seo\.gates\[1\]\}/);
      expect(channel).toMatch(/\/dizayn-cheloveka\/centry\/\$\{centerSeoSlug\(seo\.centers\[0\]\)\}/);
      expect(channel).toMatch(/\/dizayn-cheloveka\/centry\/\$\{centerSeoSlug\(seo\.centers\[1\]\)\}/);
    });

    it("gateSeo exposes channelLinks/partnerGates consistent with the channel registry", () => {
      // Gate 32 belongs to channel 32-54 with partner gate 54.
      const g32 = gateSeo(32);
      expect(g32).not.toBeNull();
      expect(g32!.channelLinks.map((c) => c.key)).toContain("32-54");
      expect(g32!.partnerGates).toContain(54);
      // Every gate has at least one channel link and every channel resolves.
      for (const slug of ALL_GATE_SLUGS) {
        const seo = gateSeo(Number(slug));
        expect(seo, `gate ${slug}`).not.toBeNull();
        expect(seo!.channelLinks.length, `gate ${slug} channels`).toBeGreaterThan(0);
        expect(seo!.channelLinks.length).toBe(seo!.partnerGates.length);
        for (const link of seo!.channelLinks) {
          expect(channelSeo(link.key), `channel ${link.key}`).not.toBeNull();
        }
      }
      for (const key of ALL_CHANNEL_SLUGS) {
        expect(channelSeo(key), `channel ${key}`).not.toBeNull();
      }
    });

    it("every channel page carries hand-authored unique essence (no thin template)", () => {
      const essenceBodies = new Set<string>();
      for (const key of ALL_CHANNEL_SLUGS) {
        const seo = channelSeo(key)!;
        const essenceSection = seo.sections.find((s) => s.title === "Суть канала");
        const practiceSection = seo.sections.find((s) => s.title === "Как это проживать");
        expect(essenceSection, `channel ${key} essence`).toBeTruthy();
        expect(practiceSection, `channel ${key} practice`).toBeTruthy();
        // Essence must name this channel (not a generic interchangeable text).
        expect(essenceSection!.body, `channel ${key}`).toContain(key);
        essenceBodies.add(essenceSection!.body);
      }
      // 36 channels → 36 distinct essence texts.
      expect(essenceBodies.size).toBe(ALL_CHANNEL_SLUGS.length);
    });
  });

  describe("photo-rasklad preservation", () => {
    it("keeps URL, title and true AI claim; links the guide article", () => {
      const page = read("src/app/photo-rasklad/page.tsx");
      expect(page).toContain('path: "/photo-rasklad"');
      // Title intentionally untouched (TOP-3 positions must not be risked).
      expect(page).toContain("Расшифровка Таро по фото онлайн — загрузить расклад");
      // ИИ claim is true: VISION_ANALYSIS recognition pipeline exists.
      expect(page).toMatch(/ИИ распознает арканы/);
      expect(page).toMatch(/FAQPage/);
      expect(page).toMatch(/HowTo/);
      expect(page).toContain('/statyi/rasshifrovka-taro-po-foto');
    });

    it("guide article keeps a different (informational) intent and leads to the tool", () => {
      const article = read("src/lib/seo/articles-extra.ts");
      expect(article).toContain('slug: "rasshifrovka-taro-po-foto"');
      expect(article).toContain('title: "Как работает расшифровка Таро по фото"');
      expect(article).toMatch(/href: "\/photo-rasklad"/);
    });
  });

  describe("relationship intent metadata", () => {
    it("zhdat-ili-zabyt covers both «гадание» and «расклад» phrasings", () => {
      const overrides = read("src/lib/seo/seo-meta-overrides.ts");
      const block = overrides.match(/"zhdat-ili-zabyt": \{[\s\S]*?\n  \},/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/Гадание «Ждать или забыть»/);
      expect(block![0]).toMatch(/расклад Таро/i);
    });

    it("growing relationship intents have hand-written overrides (not thin template)", () => {
      const overrides = read("src/lib/seo/seo-meta-overrides.ts");
      for (const slug of ["on-svoboden", "poceluet-li-on", "prognoz-na-polgoda"]) {
        const block = overrides.match(new RegExp(`"${slug}": \\{[\\s\\S]*?\\n  \\},`));
        expect(block, slug).not.toBeNull();
        expect(block![0], slug).toMatch(/seoTitle:/);
        expect(block![0], slug).toMatch(/whenFits:/);
        expect(block![0], slug).toMatch(/bodyParagraphs:/);
      }
    });

    it("semantic duplicate intents stay out of search index", () => {
      const idx = read("src/lib/seo/indexability.ts");
      expect(idx).toContain('"lyubov-kak-otpustit-ego"');
      expect(idx).toContain('"lyubov-kak-otpustit-ee"');
    });
  });

  describe("sitemap / robots hygiene", () => {
    it("sitemap includes growing public families", () => {
      const sitemap = read("src/app/sitemap.ts");
      for (const route of [
        '"/dizayn-cheloveka"',
        '"/dizayn-cheloveka/rasschitat"',
        '"/dizayn-cheloveka/sovmestimost"',
        '"/dizayn-cheloveka/sovmestimost/rasschitat"',
        '"/dizayn-cheloveka/tipy"',
        '"/dizayn-cheloveka/profili"',
        '"/dizayn-cheloveka/vorota"',
        '"/dizayn-cheloveka/kanaly"',
        '"/dizayn-cheloveka/centry"',
        '"/photo-rasklad"',
      ]) {
        expect(sitemap, route).toContain(`staticPage(${route}`);
      }
      // Dynamic families are generated from the same datasets as the routes.
      expect(sitemap).toMatch(/ALL_GATE_SLUGS\.map/);
      expect(sitemap).toMatch(/ALL_CHANNEL_SLUGS\.map/);
      expect(sitemap).toMatch(/HD_PAIR_SLUGS\.map/);
      expect(sitemap).toMatch(/getAllSpreadIntents\(\)/);
    });

    it("sitemap never lists private/user-specific routes", () => {
      const sitemap = read("src/app/sitemap.ts");
      for (const banned of [
        "/api/",
        "/admin",
        "/cabinet",
        "/auth/",
        "/dizayn-cheloveka/karta/",
        "/photo-rasklad/result",
        "ask&spread",
        "?ask",
      ]) {
        expect(sitemap, banned).not.toContain(banned);
      }
    });

    it("robots keeps user-specific HD/photo routes disallowed and clean-params set", () => {
      const robots = read("src/app/robots.txt/route.ts");
      expect(robots).toContain('"/dizayn-cheloveka/karta/"');
      expect(robots).toContain('"/photo-rasklad/result"');
      // Clean-param line is built from CLEAN_PARAMS — assert the keys are listed.
      expect(robots).toMatch(/Clean-param: \$\{CLEAN_PARAMS\.join/);
      for (const key of ['"utm_source"', '"yclid"', '"ask"', '"spread"']) {
        expect(robots, key).toContain(key);
      }
    });
  });
});
