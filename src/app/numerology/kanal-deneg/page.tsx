import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Канал денег в матрице судьбы — зона ресурса | Zovus",
  description:
    "Канал денег в матрице судьбы: где на схеме зона ресурса и как её читать. Это не прогноз дохода и не «счастливое число» — расчёт по дате на Zovus.",
  path: "/numerology/kanal-deneg",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Нумерология", path: "/numerology" },
  { name: "Канал денег", path: "/numerology/kanal-deneg" },
];

const faq = [
  {
    q: "Что такое канал денег в матрице?",
    a: "Это линия и точки схемы, которые в методике Zovus описывают отношение к ресурсу: как вы зарабатываете, держите и теряете силы. Не сумма на счёте.",
  },
  {
    q: "Можно ли узнать канал денег без полной матрицы?",
    a: "Нет. Зона денег читается вместе с предназначением и хвостом. Отдельная «цифра богатства» без схемы — маркетинг, не расчёт.",
  },
  {
    q: "Это замена расклада на деньги?",
    a: "Нет. Матрица даёт каркас. Таро или руны отвечают на конкретный шаг: смена работы, вклад, разговор о гонораре.",
  },
];

export default function KanalDenegPage() {
  const structuredData = buildForecastStructuredData({
    title: "Канал денег в матрице судьбы",
    description: "Где на схеме матрицы зона ресурса и как её открыть.",
    path: "/numerology/kanal-deneg",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="money_channel_view" />
      <p className="text-sm text-aura-gold/80">Матрица судьбы · Ресурс</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Канал денег в матрице судьбы</h1>
      <p className="mt-4 text-white/70">
        Канал денег — не «сколько заработаете в этом году». Это арканы зоны ресурса: где вы
        перегораете, где просите меньше, чем стоит работа, и где деньги приходят только через чужой
        сценарий.
      </p>

      <SeoSection title="Как открыть зону">
        <p>
          Считается та же{" "}
          <Link href="/numerology/destiny-matrix" className="text-aura-gold hover:underline">
            матрица по дате рождения
          </Link>
          . На схеме зона денег рядом с линиями комфорта и предназначения. Полный разбор с Эвелиной
          переводит арканы в рабочие формулировки, а не в «вам светит богатство».
        </p>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/numerology/destiny-matrix" trackGoal="money_channel_cta_click">
          Рассчитать матрицу
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/rasklady/na-dengi"
          variant="ghost"
          trackGoal="money_channel_cta_click"
          trackParams={{ target: "tarot" }}
        >
          Таро на деньги
        </SeoTrackedCta>
      </div>

      <SeoSection title="Рядом">
        <p>
          Повторяющиеся блоки —{" "}
          <Link href="/numerology/karmicheskiy-khvost" className="text-aura-gold hover:underline">
            кармический хвост
          </Link>
          . Короткий вопрос «брать ли оффер» — руны или Таро, не ещё одна схема.
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

      <SeoRelatedTools extraLinks={[{ href: "/runy/na-dengi", label: "Руны на деньги" }]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
