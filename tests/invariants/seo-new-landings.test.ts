/**
 * Commercial SEO landings: wave 1 (Sep 2026) + wave 2 (synastry,
 * comparison, numerology calcs, love/future umbrellas, minors, aura free).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_ALIASES } from "@/lib/seo/canonical-aliases";
import { lifePathNumber, personalYear, soulNumber } from "@/lib/numerology/calculator";
import {
  FEATURED_HD_PAIR_SLUG,
  HD_PAIR_ALIASES,
  hdPairSeoBySlug,
} from "@/lib/human-design/seo-compatibility";

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
  {
    file: "src/app/natalnaya-karta/sovmestimost/page.tsx",
    path: "/natalnaya-karta/sovmestimost",
    title: "Синастрия онлайн — совместимость натальных карт",
    h1: "Синастрия — совместимость натальных карт",
  },
  {
    file: "src/app/natal-ili-matrica/page.tsx",
    path: "/natal-ili-matrica",
    title: "Натальная карта или матрица судьбы — что выбрать",
    h1: "Натальная карта или матрица судьбы — что выбрать",
  },
  {
    file: "src/app/numerology/lichnyy-god/page.tsx",
    path: "/numerology/lichnyy-god",
    title: "Личный год по дате рождения — рассчитать бесплатно",
    h1: "Личный год по дате рождения",
  },
  {
    file: "src/app/numerology/rasschitat/page.tsx",
    path: "/numerology/rasschitat",
    title: "Рассчитать нумерологию по дате рождения бесплатно",
    h1: "Рассчитать нумерологию по дате рождения",
  },
  {
    file: "src/app/gadanie/na-lyubov/page.tsx",
    path: "/gadanie/na-lyubov",
    title: "Гадание на любовь онлайн — Таро, Ленорман и руны",
    h1: "Гадание на любовь онлайн — Таро, Ленорман и руны",
  },
  {
    file: "src/app/lenormand/da-net/page.tsx",
    path: "/lenormand/da-net",
    title: "Ленорман да или нет — короткий ответ онлайн",
    h1: "Ленорман да или нет",
  },
  {
    file: "src/app/cards/mladshie-arkany/page.tsx",
    path: "/cards/mladshie-arkany",
    title: "Младшие арканы Таро — 56 карт четырёх мастей",
    h1: "Младшие арканы Таро: 56 карт и четыре масти",
  },
  {
    file: "src/app/voskhodyashchiy-znak/page.tsx",
    path: "/voskhodyashchiy-znak",
    title: "Восходящий знак — асцендент по дате, времени и месту",
    h1: "Восходящий знак — асцендент по времени рождения",
  },
  {
    file: "src/app/numerology/chislo-dushi/page.tsx",
    path: "/numerology/chislo-dushi",
    title: "Число души по имени — рассчитать бесплатно",
    h1: "Число души по имени",
  },
  {
    file: "src/app/numerology/karmicheskiy-khvost/page.tsx",
    path: "/numerology/karmicheskiy-khvost",
    title: "Кармический хвост в матрице судьбы — что это",
    h1: "Кармический хвост в матрице судьбы",
  },
  {
    file: "src/app/numerology/kanal-deneg/page.tsx",
    path: "/numerology/kanal-deneg",
    title: "Канал денег в матрице судьбы — зона ресурса",
    h1: "Канал денег в матрице судьбы",
  },
  {
    file: "src/app/runy/na-rabotu/page.tsx",
    path: "/runy/na-rabotu",
    title: "Руны на работу — гадание онлайн",
    h1: "Руны на работу",
  },
  {
    file: "src/app/runy/na-dengi/page.tsx",
    path: "/runy/na-dengi",
    title: "Руны на деньги — гадание онлайн",
    h1: "Руны на деньги",
  },
  {
    file: "src/app/lenormand/na-rabotu/page.tsx",
    path: "/lenormand/na-rabotu",
    title: "Ленорман на работу — расклад онлайн",
    h1: "Ленорман на работу",
  },
  {
    file: "src/app/gadanie/na-budushchee/page.tsx",
    path: "/gadanie/na-budushchee",
    title: "Гадание на будущее онлайн — Таро, гороскоп и личный год",
    h1: "Гадание на будущее онлайн",
  },
  {
    file: "src/app/taro/tri-karty/page.tsx",
    path: "/taro/tri-karty",
    title: "Расклад на три карты Таро — первый разбор онлайн",
    h1: "Расклад на три карты Таро",
  },
  {
    file: "src/app/aura/besplatno/page.tsx",
    path: "/aura/besplatno",
    title: "Что входит в бесплатный снимок ауры",
    h1: "Что входит в бесплатный снимок ауры",
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
    expect(read("src/app/gadanie/na-lyubov/page.tsx")).not.toContain(
      ">Гадание онлайн бесплатно<"
    );
    expect(read("src/app/aura/besplatno/page.tsx")).toContain(
      ">Что входит в бесплатный снимок ауры<"
    );
    expect(read("src/app/aura/page.tsx")).toMatch(/Аура по фото онлайн/);
    expect(read("src/app/numerology/page.tsx")).toContain("Нумерология по дате рождения онлайн");
    expect(read("src/app/numerology/rasschitat/page.tsx")).toContain(
      ">Рассчитать нумерологию по дате рождения<"
    );
  });

  it("sitemap lists the new commercial hubs", () => {
    const sitemap = read("src/app/sitemap.ts");
    for (const page of LANDINGS) {
      expect(sitemap, page.path).toContain(`staticPage("${page.path}"`);
    }
    expect(sitemap).toContain('staticPage("/numerology/detskaya-matritsa"');
  });

  it("projector × manifestor pair is unique and aliased", () => {
    expect(FEATURED_HD_PAIR_SLUG).toBe("manifestor-i-proektor");
    const seo = hdPairSeoBySlug("manifestor-i-proektor");
    expect(seo?.title).toMatch(/Проектор и Манифестор/);
    expect(seo?.h1).toBe("Проектор и Манифестор: совместимость");
    expect(seo?.navLabel).toBe("Проектор + Манифестор");
    expect(seo?.faq.some((item) => /проектор и манифестор/i.test(item.q))).toBe(true);
    expect(hdPairSeoBySlug("proektor-i-manifestor")?.slug).toBe("manifestor-i-proektor");
    expect(hdPairSeoBySlug("proyektor-i-manifestor")?.slug).toBe("manifestor-i-proektor");
    expect(CANONICAL_ALIASES["/proyektor-i-manifestor"]).toBe(
      "/dizayn-cheloveka/sovmestimost/manifestor-i-proektor"
    );
    expect(HD_PAIR_ALIASES["/proektor-i-manifestor"]).toBe(
      "/dizayn-cheloveka/sovmestimost/manifestor-i-proektor"
    );
    const hub = read("src/app/dizayn-cheloveka/page.tsx");
    expect(hub).toContain("/dizayn-cheloveka/sovmestimost/rasschitat");
    expect(hub).toContain("/dizayn-cheloveka/sovmestimost/manifestor-i-proektor");
    expect(hub).toContain("/natal-ili-matrica");
    expect(hub).toContain("/photo-rasklad");
    const pairPage = read("src/app/dizayn-cheloveka/sovmestimost/[pair]/page.tsx");
    expect(pairPage).toContain("seo.h1");
    expect(pairPage).toContain("/dizayn-cheloveka/sovmestimost/rasschitat");
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
    expect(CANONICAL_ALIASES["/sinastriya"]).toBe("/natalnaya-karta/sovmestimost");
    expect(CANONICAL_ALIASES["/sovmestimost-po-date"]).toBe("/numerology/compatibility");
    expect(CANONICAL_ALIASES["/rasklad-na-tri-karty"]).toBe("/taro/tri-karty");
    expect(CANONICAL_ALIASES["/keltskiy-krest"]).toBe("/rasklad/keltskij-krest");
    expect(CANONICAL_ALIASES["/gadanie-na-kartakh"]).toBe("/taro");
    expect(CANONICAL_ALIASES["/lichnyy-god"]).toBe("/numerology/lichnyy-god");
    expect(CANONICAL_ALIASES["/gadanie-na-lyubov"]).toBe("/gadanie/na-lyubov");
    expect(CANONICAL_ALIASES["/mladshie-arkany"]).toBe("/cards/mladshie-arkany");
    expect(CANONICAL_ALIASES["/aura-besplatno"]).toBe("/aura/besplatno");
    expect(CANONICAL_ALIASES["/proyektor-i-manifestor"]).toBe(
      "/dizayn-cheloveka/sovmestimost/manifestor-i-proektor"
    );
    expect(CANONICAL_ALIASES["/dizayn-cheloveka/sovmestimost/proektor-i-manifestor"]).toBe(
      "/dizayn-cheloveka/sovmestimost/manifestor-i-proektor"
    );
  });

  it("карта дня and три карты do not sell the guest triplet as daily cards", () => {
    const karta = read("src/app/gadanie/karta-dnya/page.tsx");
    expect(karta).toContain("/?ask=1&spread=1");
    expect(karta).toContain("Попробовать первый расклад");
    expect(karta).not.toMatch(/href="\/\?ask=1&spread=1"[\s\S]{0,80}карта дня/i);
    expect(karta).toContain("не «карта дня»");
    expect(karta).toContain("/rasklady/karta-dnya");

    const three = read("src/app/taro/tri-karty/page.tsx");
    expect(three).toContain("/?ask=1&spread=1");
    expect(three).toContain("Попробовать первый расклад");
    expect(three).toContain("не «карта дня»");
    expect(three).not.toMatch(/href="\/\?ask=1&spread=1"[\s\S]{0,80}карта дня/i);

    const taro = read("src/app/taro/page.tsx");
    expect(taro).toContain('href="/?ask=1&spread=1"');
    expect(taro).toContain("Попробовать первый расклад");
    expect(taro).not.toContain("/?spread=triplet");
    expect(taro).toContain("Это не карта дня");

    const gadanie = read("src/app/gadanie/page.tsx");
    expect(gadanie).toContain('href="/?ask=1&spread=1"');
    expect(gadanie).toContain("Попробовать первый расклад");
    expect(gadanie).not.toContain("/?spread=triplet");
    expect(gadanie).toContain("Это не карта дня");
  });

  it("public numerology calcs use the shared engine and do not persist a receipt", () => {
    const preview = read("src/components/numerolog/LifePathPreview.tsx");
    expect(preview).toContain("lifePathNumber");
    expect(preview).not.toMatch(/localStorage\.|sessionStorage\.|guest_resume|claimToken/);
    const shared = read("src/components/numerolog/NumerologyPublicCalc.tsx");
    expect(shared).toContain("lifePathNumber");
    expect(shared).toContain("personalYear");
    expect(shared).toContain("soulNumber");
    expect(shared).not.toMatch(/localStorage\.|sessionStorage\.|guest_resume|claimToken/);
    expect(lifePathNumber("1990-01-01").number).toBeGreaterThan(0);
    expect(personalYear("1990-01-01", 2026).number).toBeGreaterThan(0);
    expect(soulNumber("Анна").number).toBeGreaterThan(0);
  });

  it("rising sign landing does not mint a natal guest claim", () => {
    const src = read("src/app/voskhodyashchiy-znak/page.tsx");
    expect(src).toContain("/natalnaya-karta");
    expect(src).not.toMatch(/NatalGuestCalculator|claimToken|guest_resume/);
  });
});
