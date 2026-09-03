import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Руны на деньги — гадание онлайн | Zovus",
  description:
    "Гадание на рунах на деньги: брать ли заказ, ждать ли выплату, где блок. Феху и прямой ответ «да/нет» — не прогноз дохода. Zovus.",
  path: "/runy/na-dengi",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Руны", path: "/runy" },
  { name: "На деньги", path: "/runy/na-dengi" },
];

const faq = [
  {
    q: "Какая руна отвечает за деньги?",
    a: "Чаще всего Феху — движимый ресурс. Но в денежном вопросе так же важны Наутиз (нехватка), Гебо (обмен) и Йера (урожай в срок). Одна Феху не равна «вам заплатят».",
  },
  {
    q: "Руны предсказывают сумму?",
    a: "Нет. Они отвечают на действие: брать заказ, ждать, менять условия. Сумму и каркас года лучше смотреть в матрице или личном годе.",
  },
  {
    q: "Можно ли гадать на деньги бесплатно?",
    a: "Первый персональный расклад на главной — три карты Таро. Рунический «да/нет» — схема; полный сеанс с Рагнаром — по тарифу.",
  },
];

export default function RunyNaDengiPage() {
  const structuredData = buildForecastStructuredData({
    title: "Руны на деньги",
    description: "Гадание на рунах на деньги и финансовое решение.",
    path: "/runy/na-dengi",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="runes_money_view" />
      <p className="text-sm text-aura-gold/80">Руны · Деньги</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Руны на деньги</h1>
      <p className="mt-4 text-white/70">
        Руны не считают зарплату. Они отвечают, стоит ли брать заказ, ждать выплату или менять
        условие. Если нужен каркас «как у меня с ресурсом вообще» — откройте канал денег в матрице.
      </p>

      <SeoSection title="Выберите формат">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/rasklad/runy-da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Руны да / нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна руна на конкретный шаг: счёт, заказ, разговор о гонораре.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Спросить →</p>
          </Link>
          <Link
            href="/rasklady/na-dengi"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро на деньги</p>
            <p className="mt-1 text-sm text-white/70">
              Когда вопрос шире «да/нет»: куда утекает ресурс и что мешает.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Каталог →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/rasklad/runy-da-net" trackGoal="runes_money_cta_click">
          Гадать на рунах
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/numerology/kanal-deneg"
          variant="ghost"
          trackGoal="runes_money_cta_click"
          trackParams={{ target: "matrix" }}
        >
          Канал денег в матрице
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как спросить">
        <p>
          «Брать ли этот заказ» лучше, чем «когда я разбогатею». Феху в денежном вопросе часто
          значит «ресурс уже в обороте», а не «завтра придут миллионы».
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
          { href: "/runy/na-rabotu", label: "Руны на работу" },
          { href: "/numerology/kanal-deneg", label: "Канал денег" },
          { href: "/rasklady/na-dengi", label: "Таро на деньги" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
