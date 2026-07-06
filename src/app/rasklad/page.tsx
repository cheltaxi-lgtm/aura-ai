import type { Metadata } from "next";
import Link from "next/link";
import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Схемы раскладов Таро — каталог | Zovus",
  description:
    "Схемы раскладов Таро: три карты, да/нет, кельтский крест и другие. Выберите схему и начните гадание онлайн на Zovus.",
  path: "/rasklad",
});

export default function RaskladIndexPage() {
  const spreads = Object.values(SPREAD_REGISTRY).filter((s) => s.seoSlug);

  return (
    <SeoPageShell backHref="/taro" backLabel="Таро онлайн">
      <p className="text-sm text-aura-gold/80">Схемы раскладов</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклады Таро: схемы и позиции</h1>
      <p className="mt-4 text-white/70">
        Каждая схема — фиксированные позиции карт. Выберите подходящую под свой вопрос или начните с
        классики — три карты или одна карта дня.
      </p>

      <SeoSection title="Популярные схемы">
        <ul className="space-y-3">
          {spreads.map((spread) => (
            <li key={spread.id}>
              <Link
                href={`/rasklad/${spread.seoSlug}`}
                className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:border-aura-gold/30"
              >
                <span className="font-medium text-aura-gold">{spread.label}</span>
                <span className="mt-1 block text-sm text-white/60">
                  {spread.cardCount} карт · {spread.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection title="Готовые вопросы">
        <p>
          Не знаете, какую схему выбрать?{" "}
          <Link href="/rasklady" className="text-aura-gold hover:underline">
            Каталог раскладов по темам
          </Link>{" "}
          подберёт схему под ваш вопрос автоматически.
        </p>
      </SeoSection>
    </SeoPageShell>
  );
}
