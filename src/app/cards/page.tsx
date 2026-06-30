import type { Metadata } from "next";
import Link from "next/link";
import {
  cardSeoSlug,
  getFeaturedTarotCards,
  getMajorTarotCards,
} from "@/lib/card-seo";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { BRAND_NAME } from "@/lib/brand";
import { SeoPageShell } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = {
  title: `Значения карт Таро — справочник | ${BRAND_NAME}`,
  description:
    "Значения старших и младших арканов Таро — для самостоятельного изучения и подготовки к раскладу с мастером Zovus.",
};

export default function CardsCatalogPage() {
  const major = getMajorTarotCards();
  const featured = getFeaturedTarotCards(8);
  const combinations = getAllCardCombinations().slice(0, 6);

  return (
    <SeoPageShell backHref="/rasklady" backLabel="Расклады">
      <p className="text-sm text-aura-gold/80">Справочник</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Значения карт Таро</h1>
      <p className="mt-4 text-white/70">
        Изучите символику арканов — а когда будете готовы, мастер Zovus поможет связать карты с вашим
        вопросом в живом диалоге.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg text-aura-gold">Старшие арканы</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {major.map((card) => (
            <Link
              key={card.id}
              href={`/cards/${cardSeoSlug(card)}`}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-aura-gold/30"
            >
              <span className="text-white">{card.name}</span>
              <span className="mt-1 block text-sm text-white/50">{card.meaning}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-aura-gold">Популярные карты</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {featured.map((card) => (
            <li key={card.id}>
              <Link
                href={`/cards/${cardSeoSlug(card)}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-aura-gold/40"
              >
                {card.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-aura-gold">Сочетания карт</h2>
        <ul className="mt-4 space-y-2">
          {combinations.map((combo) => (
            <li key={combo.slug}>
              <Link href={`/cards/combinations/${combo.slug}`} className="text-aura-gold hover:underline">
                {combo.title}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/cards/combinations" className="mt-4 inline-block text-sm text-aura-gold hover:underline">
          Все сочетания →
        </Link>
      </section>
    </SeoPageShell>
  );
}
