import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Руны на работу — гадание онлайн | Zovus",
  description:
    "Гадание на рунах на работу: смена места, собеседование, «оставаться или уходить». Прямой ответ старшим Футарком — Zovus.",
  path: "/runy/na-rabotu",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Руны", path: "/runy" },
  { name: "На работу", path: "/runy/na-rabotu" },
];

const faq = [
  {
    q: "Какие руны чаще выпадают в рабочих вопросах?",
    a: "Феху — ресурс, Райдо — путь и смена, Тиваз — спор и принцип, Наутиз — необходимость терпеть или пауза. Одна руна читается вместе с формулировкой, не как лозунг.",
  },
  {
    q: "Руны или Таро на работу?",
    a: "Руны — когда вопрос уже бинарный: уходить, соглашаться, писать руководителю. Таро — когда нужна динамика коллектива и скрытые мотивы.",
  },
  {
    q: "Можно ли гадать на работу бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро. Рунический «да/нет» открывается как схема; полный сеанс с Рагнаром — по тарифу.",
  },
];

export default function RunyNaRabotuPage() {
  const structuredData = buildForecastStructuredData({
    title: "Руны на работу",
    description: "Гадание на рунах на работу и карьерное решение.",
    path: "/runy/na-rabotu",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="runes_work_view" />
      <p className="text-sm text-aura-gold/80">Руны · Работа</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Руны на работу</h1>
      <p className="mt-4 text-white/70">
        Старший Футарк хорошо держит рабочий вопрос, если он про действие: уходить, соглашаться,
        ждать оффера. Если нужна атмосфера отдела и «кто что думает» — рядом Таро.
      </p>

      <SeoSection title="Выберите формат">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/rasklad/runy-da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Руны да / нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна руна на решение: оффер, увольнение, разговор с руководителем.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Спросить →</p>
          </Link>
          <Link
            href="/rasklady/kariera"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро на карьеру</p>
            <p className="mt-1 text-sm text-white/70">
              Когда руны слишком коротки и нужен разбор ситуации в коллективе.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Каталог →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/rasklad/runy-da-net" trackGoal="runes_work_cta_click">
          Гадать на рунах
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/runy"
          variant="ghost"
          trackGoal="runes_work_cta_click"
          trackParams={{ target: "hub" }}
        >
          Значения 24 рун
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как спросить">
        <p>
          «Стоит ли принимать оффер на этой неделе» лучше, чем «кем мне работать всю жизнь». Руна
          Наутиз часто значит «ещё не время менять», а не «вы застряли навсегда».
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
          { href: "/runy", label: "Гадание на рунах" },
          { href: "/runy/na-dengi", label: "Руны на деньги" },
          { href: "/lenormand/na-rabotu", label: "Ленорман на работу" },
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
