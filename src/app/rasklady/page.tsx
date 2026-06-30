import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllSpreadIntents,
  getFeaturedSpreadIntents,
  SPREAD_INTENT_CATEGORY_LABELS,
  type SpreadIntentCategory,
} from "@/lib/spread-intents";
import { estimateIntentRuneCost } from "@/lib/spread-intents/router";
import { getSpread } from "@/lib/spreads";
import { getCharacterById } from "@/lib/characters";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Расклады Таро онлайн — каталог вопросов | ${BRAND_NAME}`,
  description:
    "Выберите готовый вопрос — Zovus подберёт мастера, схему расклада и персональную расшифровку с памятью сессии.",
  path: "/rasklady",
});

const CATEGORY_ORDER: SpreadIntentCategory[] = [
  "love",
  "money",
  "career",
  "future",
  "self",
  "choice",
  "ritual",
  "family",
];

export default function RaskladyCatalogPage() {
  const featured = getFeaturedSpreadIntents(6);
  const all = getAllSpreadIntents();

  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <p className="text-sm text-aura-gold/80">Каталог раскладов</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклады Zovus</h1>
      <p className="mt-4 text-white/70">
        Выберите вопрос — мы подберём мастера и схему. Каждый расклад ведёт в живой диалог с
        ИИ-наставником, а не в сухой шаблон.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg text-aura-gold">Популярное</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {featured.map((intent) => {
            const master = getCharacterById(intent.recommendedMasterId);
            const spread = getSpread(intent.spreadId);
            return (
              <Link
                key={intent.slug}
                href={`/rasklady/${intent.slug}`}
                className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30 hover:bg-white/[0.07]"
              >
                <p className="font-medium text-white">{intent.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-white/55">{intent.intro}</p>
                <p className="mt-3 text-xs text-white/40">
                  {master?.name ?? intent.recommendedMasterId} · {spread.label} · от{" "}
                  {estimateIntentRuneCost(intent.spreadId)} ᚢ
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const items = all.filter((i) => i.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="mt-10">
            <h2 className="font-display text-lg text-aura-gold">
              {SPREAD_INTENT_CATEGORY_LABELS[category]}
            </h2>
            <ul className="mt-4 space-y-2">
              {items.map((intent) => (
                <li key={intent.slug}>
                  <Link
                    href={`/rasklady/${intent.slug}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 transition hover:border-white/10 hover:bg-white/5"
                  >
                    <span>{intent.title}</span>
                    <span className="text-sm text-aura-gold/80">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mt-12 flex flex-wrap gap-3">
        <Link href="/photo-rasklad" className="text-sm text-aura-gold hover:underline">
          Фото-расклад
        </Link>
        <Link href="/obryady" className="text-sm text-aura-gold hover:underline">
          Обряды
        </Link>
        <Link href="/numerology" className="text-sm text-aura-gold hover:underline">
          Нумерология
        </Link>
        <Link href="/cards" className="text-sm text-aura-gold hover:underline">
          Значения карт
        </Link>
      </section>
    </SeoPageShell>
  );
}
