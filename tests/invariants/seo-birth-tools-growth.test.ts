import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCalculatorStructuredData } from "@/lib/seo/structured-data";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("matrix and natal organic growth", () => {
  it("gives each calculator a transactional title without changing its canonical URL", () => {
    const matrix = read("src/app/numerology/[slug]/page.tsx");
    const natal = read("src/app/natalnaya-karta/page.tsx");

    expect(matrix).toContain("Матрица судьбы онлайн — рассчитать бесплатно");
    expect(matrix).toContain("path: `/numerology/${slug}`");
    expect(natal).toContain("Натальная карта онлайн — рассчитать бесплатно");
    expect(natal).toContain('const PATH = "/natalnaya-karta"');
  });

  it("describes visible free calculators with WebApplication, HowTo and FAQ markup", () => {
    const graph = buildCalculatorStructuredData({
      title: "Тестовый расчёт",
      description: "Описание расчёта",
      path: "/test-calculator",
      faq: [{ q: "Вопрос?", a: "Ответ." }],
      steps: [{ name: "Шаг", text: "Действие" }],
      features: ["Бесплатный результат"],
      bodyText: "Видимое содержание",
    });

    expect(graph["@graph"].map((node) => node["@type"])).toEqual([
      "WebApplication",
      "Article",
      "HowTo",
      "FAQPage",
    ]);
    expect(graph["@graph"][0]).toMatchObject({
      isAccessibleForFree: true,
      offers: { price: "0", priceCurrency: "RUB" },
    });
  });

  it("links the calculator pages to focused supporting guides", () => {
    const matrix = read("src/app/numerology/[slug]/page.tsx");
    const natal = read("src/app/natalnaya-karta/page.tsx");

    for (const href of [
      "/statyi/chto-takoe-matrica-sudby",
      "/statyi/matrica-sudby-po-date-rozhdeniya",
      "/statyi/matrica-sudby-oshibki-rascheta",
    ]) {
      expect(matrix).toContain(href);
    }
    for (const href of [
      "/statyi/natalnaya-karta-po-date-rozhdeniya",
      "/statyi/natalnaya-karta-besplatno-online",
      "/statyi/natalnaya-karta-bez-vremeni-rozhdeniya",
      "/statyi/doma-v-natalnoy-karte",
    ]) {
      expect(natal).toContain(href);
    }
  });

  it("replaces generic generated copy in the promoted supporting articles", () => {
    const articles = read("src/lib/seo/articles-extra.ts");

    for (const phrase of [
      "Если две матрицы по одной дате не совпали",
      "Зона комфорта — центральная энергия матрицы",
      "Бесплатный расчёт показывает схему",
      "Карьерный потенциал в натальной карте",
      "Неизвестное время рождения не делает натальную карту бесполезной",
      "Двенадцать домов делят натальную карту",
      "Асцендент — знак, который поднимался",
    ]) {
      expect(articles).toContain(phrase);
    }
  });
});
