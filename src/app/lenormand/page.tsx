import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import LenormandCatalog from "@/components/seo/LenormandCatalog";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";

export const metadata: Metadata = buildSeoMetadata({
  title: `Ленорман онлайн — линия из 5 карт и расклады | ${BRAND_NAME}`,
  description:
    "Онлайн-расклады Ленорман: линия из пяти карт, быстрые ответы на любовь, работу и сроки. Персональная расшифровка с мастером Zovus.",
  path: "/lenormand",
});

const faq = [
  {
    q: "Когда выбрать Ленорман, а когда натальную карту?",
    a: "Ленорман — для короткого ответа по ситуации «что дальше». Натальная карта — для базового портрета личности и периодов жизни. Если вопрос про характер и путь, начните с /natalnaya-karta.",
  },
  {
    q: "Поможет ли матрица судьбы вместе с Ленорман?",
    a: "Да: матрица задаёт числовой каркас, Ленорман показывает ближайший сюжет. Бесплатный расчёт — на /numerology/destiny-matrix.",
  },
];

export default function LenormandHubPage() {
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Ленорман", path: "/lenormand" },
  ];
  const structuredData = buildForecastStructuredData({
    title: "Расклады Ленорман онлайн",
    description:
      "Онлайн-расклады Ленорман: линия из пяти карт, быстрые ответы на любовь, работу и сроки.",
    path: "/lenormand",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="lenormand_hub_view" />
      <p className="text-sm text-aura-gold/80">Колода Ленорман</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклады Ленорман онлайн</h1>
      <p className="mt-4 text-white/70">
        Ленорман — прямая колода: меньше символизма, больше конкретики. Линия из пяти карт показывает
        основу, развитие, ядро ситуации, исход и ключ — наставник Zovus свяжет позиции в связный ответ
        и продолжит диалог в чате.
      </p>

      <LenormandCatalog />

      <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-display text-lg text-white">Чем Ленорман отличается от Таро</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Таро глубже в архетипах и психологии; Ленорман быстрее отвечает на «что будет» и «когда».
          На Zovus можно начать с линии Ленорман и уточнить детали у мастера — память сессии сохраняется.
        </p>
        <Link href="/lenormand/sochetaniya" className="mt-3 inline-block text-sm text-aura-gold hover:underline">
          Сочетания пар Ленорман →
        </Link>
      </section>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <SeoRelatedTools />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
