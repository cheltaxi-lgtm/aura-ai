import type { Metadata } from "next";
import Link from "next/link";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Сочетания карт Таро — значения пар | ${BRAND_NAME}`,
  description:
    "Как читать пары карт в раскладе: любовь, деньги, совет — и переход к персональному раскладу с мастером.",
  path: "/cards/combinations",
});

export default function CombinationsCatalogPage() {
  const combinations = getAllCardCombinations();

  return (
    <SeoPageShell backHref="/cards" backLabel="Карты Таро">
      <p className="text-sm text-aura-gold/80">Сочетания</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Сочетания карт Таро</h1>
      <p className="mt-4 text-white/70">
        Две карты рядом создают новый смысл. Изучите популярные пары — или задайте свой вопрос
        мастеру.
      </p>

      <ul className="mt-10 space-y-4">
        {combinations.map((combo) => (
          <li key={combo.slug}>
            <Link
              href={`/cards/combinations/${combo.slug}`}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30"
            >
              <p className="font-medium text-white">{combo.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-white/60">{combo.general}</p>
            </Link>
          </li>
        ))}
      </ul>
    </SeoPageShell>
  );
}
