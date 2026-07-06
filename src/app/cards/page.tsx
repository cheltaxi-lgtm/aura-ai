import type { Metadata } from "next";
import Link from "next/link";
import {
  cardSeoSlug,
  getMajorTarotCards,
  getMinorTarotCards,
} from "@/lib/card-seo";
import { getAllCardCombinations } from "@/lib/card-combinations/registry";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SUIT_HUBS } from "@/lib/seo/suit-hubs";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "Значение карт Таро — все 78 карт колоды | Zovus",
  description:
    "Значение карт Таро: полный справочник 78 арканов колоды Уэйта. Старшие и младшие арканы, толкование в любви и работе — на Zovus.",
  path: "/cards",
});

export default function CardsCatalogPage() {
  const major = getMajorTarotCards();
  const minors = getMinorTarotCards();
  const combinations = getAllCardCombinations().slice(0, 6);

  return (
    <SeoPageShell backHref="/taro" backLabel="Таро онлайн">
      <p className="text-sm text-aura-gold/80">Справочник · 78 арканов</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Значение карт Таро: справочник 78 арканов</h1>
      <p className="mt-4 text-white/70">
        Колода Уэйта — 22 старших и 56 младших арканов. Изучите символику, затем свяжите карты с
        вопросом в раскладе с мастером Zovus.
      </p>

      <SeoSection title="Старшие арканы (22 карты)">
        <p className="mb-4 text-sm text-white/60">
          <Link href="/cards/starshie-arkany" className="text-aura-gold hover:underline">
            Полный раздел старших арканов →
          </Link>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
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
      </SeoSection>

      <SeoSection title="Младшие арканы по мастям">
        <ul className="mb-4 flex flex-wrap gap-2">
          {SUIT_HUBS.map((hub) => (
            <li key={hub.slug}>
              <Link
                href={`/cards/masti/${hub.slug}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-aura-gold hover:border-aura-gold/40"
              >
                {hub.titleRu}
              </Link>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          {minors.map((card) => (
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
      </SeoSection>

      <SeoSection title="Как пользоваться справочником">
        <p>
          Значение карты уточняется в контексте расклада.{" "}
          <Link href="/statyi/chto-oznachayut-karty-taro" className="text-aura-gold hover:underline">
            Как читать арканы
          </Link>{" "}
          ·{" "}
          <Link href="/cards/combinations" className="text-aura-gold hover:underline">
            Сочетания карт
          </Link>
        </p>
      </SeoSection>

      <SeoSection title="Популярные сочетания">
        <ul className="space-y-2">
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
      </SeoSection>
    </SeoPageShell>
  );
}
