import type { Metadata } from "next";
import Link from "next/link";
import { SEO_FAQ_ITEMS } from "@/lib/seo";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: "FAQ — частые вопросы о Zovus",
  description: "Оплата, бесплатные расклады, мастера, фото-расклад и история сеансов — ответы на частые вопросы.",
  path: "/faq",
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: "FAQ", path: "/faq" },
];

export default function FaqPage() {
  return (
    <AboutPageShell
      title="FAQ"
      h1="Частые вопросы"
      intro="Ответы о сервисе, оплате и раскладах. Не нашли ответ — напишите на email в подвале сайта."
      breadcrumbs={BREADCRUMBS}
    >
      <AboutSection title="Вопросы и ответы">
        {SEO_FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <p className="font-medium text-white">{item.question}</p>
            <p className="mt-1">{item.answer}</p>
          </div>
        ))}
      </AboutSection>
      <AboutSection title="Расклады и другие практики">
        <p>
          <Link href="/rasklady" className="text-aura-gold hover:underline">
            Каталог раскладов
          </Link>
          {" · "}
          <Link href="/natalnaya-karta" className="text-aura-gold hover:underline">
            Натальная карта
          </Link>
          {" · "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            Матрица судьбы
          </Link>
          {" · "}
          <Link href="/about/how-readings-work" className="text-aura-gold hover:underline">
            Как проходит расклад
          </Link>
        </p>
      </AboutSection>
      <AboutSection title="Персональная память">
        <p>
          Память включается только после отдельного выбора и помогает учитывать релевантный
          жизненный контекст в следующих консультациях. Сведения можно исправлять и удалять, а
          отдельный разговор начать без памяти.{" "}
          <Link href="/about/personal-memory" className="text-aura-gold hover:underline">
            Как работает персональная память
          </Link>
          .
        </p>
      </AboutSection>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: SEO_FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: { "@type": "Answer", text: item.answer },
            })),
          }),
        }}
      />
    </AboutPageShell>
  );
}
