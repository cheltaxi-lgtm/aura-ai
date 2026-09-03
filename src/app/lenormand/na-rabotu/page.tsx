import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Ленорман на работу — расклад онлайн | Zovus",
  description:
    "Гадание Ленорман на работу: линия из пяти карт про оффер, коллектив и сроки. Конкретнее Таро по сюжету, короче рун по действию — Zovus.",
  path: "/lenormand/na-rabotu",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Ленорман", path: "/lenormand" },
  { name: "На работу", path: "/lenormand/na-rabotu" },
];

const faq = [
  {
    q: "Когда Ленорман на работу точнее Таро?",
    a: "Когда нужен сюжет ближайших недель: письмо, встреча, смена кабинета, «кто мешает». Таро глубже разбирает мотивы, Ленорман короче говорит о событии.",
  },
  {
    q: "Какой расклад выбрать?",
    a: "Линия из пяти карт — универсальный вход. Если вопрос уже «уходить / оставаться» — быстрее руны да/нет.",
  },
  {
    q: "Можно ли гадать Ленорман на работу бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро. Ленорман открывается как схема; полный разбор линии — в сессии с мастером.",
  },
];

export default function LenormandNaRabotuPage() {
  const structuredData = buildForecastStructuredData({
    title: "Ленорман на работу",
    description: "Расклады Ленорман на работу, оффер и сроки — линия из пяти карт.",
    path: "/lenormand/na-rabotu",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="lenormand_work_view" />
      <p className="text-sm text-aura-gold/80">Ленорман · Работа</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Ленорман на работу</h1>
      <p className="mt-4 text-white/70">
        Ленорман отвечает на рабочий вопрос сценами: письмо, дом, медведь, лиса, якорь. Это не
        «предназначение на всю жизнь», а сюжет ближайшего шага — оффер, конфликт, переезд.
      </p>

      <SeoSection title="С чего начать">
        <div className="grid gap-3">
          <Link
            href="/rasklad/lenormand-liniya"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Линия из 5 карт</p>
            <p className="mt-1 text-sm text-white/70">
              Основа, развитие, ядро, исход и ключ — универсальный рабочий вход.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Открыть линию →</p>
          </Link>
          <Link
            href="/rasklady/kariera"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро на карьеру</p>
            <p className="mt-1 text-sm text-white/70">
              Если нужна глубина мотивов, а не только ближайший сюжет.
            </p>
            <p className="mt-2 text-sm text-aura-gold">К каталогу →</p>
          </Link>
          <Link
            href="/runy/na-rabotu"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Руны на работу</p>
            <p className="mt-1 text-sm text-white/70">
              Когда вопрос уже «да/нет»: принимать, уходить, ждать.
            </p>
            <p className="mt-2 text-sm text-aura-gold">К рунам →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/rasklad/lenormand-liniya" trackGoal="lenormand_work_cta_click">
          Разложить Ленорман на работу
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как формулировать">
        <p>
          Лучше «чем обернётся этот оффер в ближайший месяц», чем «кем мне работать вечно».
          Ленорман держит срок и действие, плохо — абстрактное призвание.
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

      <SeoRelatedTools
        links={[
          { href: "/lenormand", label: "Все расклады Ленорман" },
          { href: "/lenormand/na-lyubov", label: "Ленорман на любовь" },
          { href: "/lenormand/da-net", label: "Ленорман да или нет" },
          { href: "/rasklady/kariera", label: "Таро на карьеру" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
