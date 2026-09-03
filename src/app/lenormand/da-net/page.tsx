import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Ленорман да или нет — короткий ответ онлайн | Zovus",
  description:
    "Гадание Ленорман да или нет: линия из карт вместо одной карты Таро. Когда Ленорман точнее «да/нет» и когда лучше руны — Zovus.",
  path: "/lenormand/da-net",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Ленорман", path: "/lenormand" },
  { name: "Да или нет", path: "/lenormand/da-net" },
];

const faq = [
  {
    q: "Есть ли в Ленорман расклад «да/нет»?",
    a: "Отдельной одной карты «да/нет» в классике нет. На Zovus короткий ответ даёт линия: сюжет показывает, к чему клонится ситуация — да, нет или «не сейчас».",
  },
  {
    q: "Чем Ленорман да/нет отличается от Таро и рун?",
    a: "Таро и руны отвечают одной картой или руной. Ленорман говорит сценой: сердце, письмо, лиса, кольцо. Если вопрос слишком бинарный — быстрее руны.",
  },
  {
    q: "Какой расклад открыть?",
    a: "Линия из пяти карт — универсальный вход. Для любви и работы есть отдельные столпы. Общий хаб «да или нет» остаётся про Таро и руны.",
  },
];

export default function LenormandDaNetPage() {
  const structuredData = buildForecastStructuredData({
    title: "Ленорман да или нет",
    description: "Короткий ответ Ленорман через линию карт — не одна карта Таро.",
    path: "/lenormand/da-net",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="lenormand_da_net_view" />
      <p className="text-sm text-aura-gold/80">Ленорман · Да или нет</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Ленорман да или нет</h1>
      <p className="mt-4 text-white/70">
        Ленорман редко отвечает одной картой «да». Он показывает, чем ситуация кончится в ближайшем
        шаге. Если нужен лаконичный «писать / не писать» — рядом руны. Если нужен сюжет — линия.
      </p>

      <SeoSection title="Куда идти">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/rasklad/lenormand-liniya"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Линия Ленорман</p>
            <p className="mt-1 text-sm text-white/70">
              Пять карт: основа, развитие, ядро, исход и ключ — ответ читается по сюжету.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Разложить линию →</p>
          </Link>
          <Link
            href="/gadanie/da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро и руны да/нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна карта или одна руна — когда вопрос уже бинарный.
            </p>
            <p className="mt-2 text-sm text-aura-gold">К хабу да/нет →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/rasklad/lenormand-liniya" trackGoal="lenormand_da_net_cta_click">
          Открыть линию Ленорман
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как спросить">
        <p>
          Формулируйте действие и срок: «стоит ли писать на этой неделе», «пойдёт ли встреча». Не
          «любит ли он меня навсегда» — колода плохо держит вечность.
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
          { href: "/gadanie/da-net", label: "Гадание да или нет" },
          { href: "/rasklad/runy-da-net", label: "Руны да/нет" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
