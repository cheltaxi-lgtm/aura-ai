import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpreadBySeoSlug, SPREAD_REGISTRY } from "@/lib/spreads/registry";
import { BRAND_NAME } from "@/lib/brand";

export function generateStaticParams() {
  return Object.values(SPREAD_REGISTRY)
    .filter((s) => s.seoSlug)
    .map((s) => ({ slug: s.seoSlug! }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spread = getSpreadBySeoSlug(slug);
  if (!spread) return { title: "Расклад" };
  return {
    title: `${spread.label} — расклад Таро онлайн | ${BRAND_NAME}`,
    description: spread.description,
  };
}

export default async function SpreadLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spread = getSpreadBySeoSlug(slug);
  if (!spread) notFound();

  const faq = spread.positions.map((p) => ({
    question: `Что означает позиция «${p.label}»?`,
    answer: p.hint ?? `Карта в позиции «${p.label}» раскрывает этот аспект вашего вопроса.`,
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-white">
      <p className="text-sm text-aura-gold/80">Расклад · {spread.cardCount} карт</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{spread.label}</h1>
      <p className="mt-4 text-white/70">{spread.description}</p>

      <section className="mt-8">
        <h2 className="font-display text-lg text-aura-gold">Позиции расклада</h2>
        <ol className="mt-4 space-y-2">
          {spread.positions.map((p, i) => (
            <li key={p.key} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-aura-gold">{i + 1}.</span> {p.label}
              {p.hint ? <span className="block text-sm text-white/50">{p.hint}</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <Link
          href={spread.id === "daily-extended" ? "/?daily=extended" : `/?spread=${spread.id}`}
          className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
        >
          {spread.id === "daily-extended" ? "Открыть расширенный день" : "Начать расклад с мастером"}
        </Link>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          }),
        }}
      />
    </main>
  );
}
