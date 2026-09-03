import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Руны на любовь — гадание онлайн | Zovus",
  description:
    "Гадание на рунах на любовь: прямой ответ «да/нет» и разбор ситуации со старшим Футарком. Гебо, Лагуз, Кеназ — и когда лучше взять Таро.",
  path: "/runy/na-lyubov",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Руны", path: "/runy" },
  { name: "На любовь", path: "/runy/na-lyubov" },
];

const faq = [
  {
    q: "Какие руны чаще выпадают в любовных вопросах?",
    a: "Гебо — союз и обмен, Лагуз — поток чувств, Кеназ — огонь влечения, Наутиз — пауза и необходимость. Одна руна не заменяет контекст вопроса: Рагнар читает символ вместе с формулировкой.",
  },
  {
    q: "Руны или Таро на любовь?",
    a: "Руны — когда нужен прямой, короткий ответ. Таро — когда ситуация многослойная: чувства, сроки, третьи люди. Оба метода на Zovus ведут в диалог с мастером.",
  },
  {
    q: "Можно ли гадать на рунах бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро. Рунический «да/нет» и разбор вопроса открываются как схема; полный сеанс с Рагнаром — по тарифу.",
  },
];

export default function RunyNaLyubovPage() {
  const structuredData = buildForecastStructuredData({
    title: "Руны на любовь",
    description: "Гадание на рунах на любовь: да/нет и разбор ситуации старшим Футарком.",
    path: "/runy/na-lyubov",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="runes_love_view" />
      <p className="text-sm text-aura-gold/80">Руны · Любовь</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Руны на любовь</h1>
      <p className="mt-4 text-white/70">
        Старший Футарк отвечает на любовный вопрос коротко: союз, пауза, огонь, необходимость
        отпустить. Если нужен нюанс «что он чувствует и почему молчит», рядом лучше Таро. Если нужен
        прямой «писать / не писать» — начните с одной руны.
      </p>

      <SeoSection title="Выберите формат">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/rasklad/runy-da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Руны да / нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна руна — «да», «нет» или «не сейчас» с пояснением Рагнара.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Спросить →</p>
          </Link>
          <Link
            href="/rasklady/lyubov"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро на любовь</p>
            <p className="mt-1 text-sm text-white/70">
              Когда руны слишком лаконичны и нужен разбор динамики пары.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Каталог →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/rasklad/runy-da-net" trackGoal="runes_love_cta_click">
          Гадать на рунах
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/runy"
          variant="ghost"
          trackGoal="runes_love_cta_click"
          trackParams={{ target: "hub" }}
        >
          Значения 24 рун
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как не сломать вопрос">
        <p>
          Спрашивайте о действии («стоит ли написать», «идти ли на встречу»), а не о вечной любви.
          Руна Наутиз в любовном вопросе часто значит «не сейчас», а не «никогда» — это пауза, которую
          легко принять за отказ.
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
          { href: "/gadanie/da-net", label: "Да или нет" },
          { href: "/lenormand/na-lyubov", label: "Ленорман на любовь" },
          { href: "/rasklady/lyubov", label: "Таро на любовь" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
