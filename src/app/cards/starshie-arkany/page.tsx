import type { Metadata } from "next";
import Link from "next/link";
import { cardSeoSlug, getMajorTarotCards } from "@/lib/card-seo";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Карты Таро", path: "/cards" },
  { name: "Старшие арканы", path: "/cards/starshie-arkany" },
];

const faq = [
  {
    q: "Сколько старших арканов в Таро?",
    a: "22 карты — от Шута (0) до Мира (21). Они описывают ключевые архетипы и повороты пути.",
  },
  {
    q: "Чем старшие арканы отличаются от младших?",
    a: "Старшие — про большие уроки и судьбоносные темы. Младшие — про бытовые ситуации через четыре масти.",
  },
];

export const metadata: Metadata = buildSeoMetadata({
  title: "Старшие арканы Таро — значения 22 карт | Zovus",
  description:
    "Старшие арканы Таро: значение всех 22 карт от Шута до Мира. Толкование в прямом и перевёрнутом положении — полный справочник Zovus.",
  path: "/cards/starshie-arkany",
});

export default function MajorArcanaHubPage() {
  const major = getMajorTarotCards();

  return (
    <SeoPageShell backHref="/cards" backLabel="Все карты">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">22 архетипа</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Старшие арканы Таро: 22 карты и их значения
      </h1>
      <p className="mt-4 text-white/70">
        Старшие арканы — ядро символики Таро. Каждая карта несёт архетипический смысл, который
        проявляется в любви, работе и личном пути.
      </p>

      <SeoSection title="Что такое старшие арканы">
        <p>
          В колоде Уэйта 22 старших аркана идут от Шута до Мира. В раскладе они часто указывают на
          поворотные точки и глубинные уроки.
        </p>
      </SeoSection>

      <SeoSection title="Значения карт">
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

      <SeoSection title="Старшие арканы в раскладах">
        <p>
          Выпадение нескольких старших арканов усиливает значимость периода.{" "}
          <Link href="/rasklady" className="text-aura-gold hover:underline">
            Выберите вопрос
          </Link>{" "}
          — мастер свяжет символы с вашей ситуацией.
        </p>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildForecastStructuredData({
              title: "Старшие арканы Таро — значения 22 карт | Zovus",
              description:
                "Старшие арканы Таро: значение всех 22 карт от Шута до Мира.",
              path: "/cards/starshie-arkany",
              breadcrumbs,
              faq,
            })
          ),
        }}
      />
    </SeoPageShell>
  );
}
