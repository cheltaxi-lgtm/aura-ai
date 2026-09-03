import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Расклад на три карты Таро — первый разбор онлайн | Zovus",
  description:
    "Расклад Таро на три карты: прошлое, настоящее и следующий шаг по вашему вопросу. Первый персональный расклад без регистрации — это не карта дня.",
  path: "/taro/tri-karty",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Таро", path: "/taro" },
  { name: "Три карты", path: "/taro/tri-karty" },
];

const faq = [
  {
    q: "Что значит расклад на три карты?",
    a: "Три позиции по вашему вопросу: что уже сложилось, что происходит сейчас и куда клонится ближайший шаг. Это не прогноз на всю жизнь.",
  },
  {
    q: "Это карта дня?",
    a: "Нет. Карта дня — одна карта или ежедневный ритуал после входа. Первый расклад на три карты отвечает на вопрос и после регистрации не перетягивается.",
  },
  {
    q: "Можно ли сделать три карты бесплатно?",
    a: "Да. На главной вопрос → три карты → короткий тизер → полный разбор тех же карт после входа. Без банковской карты на старте.",
  },
];

export default function TaroTriKartyPage() {
  const structuredData = buildForecastStructuredData({
    title: "Расклад на три карты Таро",
    description: "Первый расклад из трёх карт по вопросу — не карта дня.",
    path: "/taro/tri-karty",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="three_cards_view" />
      <p className="text-sm text-aura-gold/80">Таро · Три карты</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклад на три карты Таро</h1>
      <p className="mt-4 text-white/70">
        Три карты — самый короткий персональный расклад: ситуация, фон и следующий шаг. На Zovus
        первый такой разбор открывается без регистрации. Это не «карта дня» и не ежедневные три
        карты после входа.
      </p>

      <SeoSection title="Три разных формата">
        <div className="grid gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Первый расклад из трёх карт</p>
            <p className="mt-1 text-sm text-white/70">
              Вопрос → три карты → тизер → полный разбор тех же карт после входа. Карты не
              перетягиваются.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">3 карты дня после входа</p>
            <p className="mt-1 text-sm text-white/70">
              Ежедневный ритуал раз в сутки. Не продаём его как ответ на гостевой вопрос.
            </p>
            <Link href="/gadanie/karta-dnya" className="mt-2 inline-block text-sm text-aura-gold hover:underline">
              Как устроена карта дня →
            </Link>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Большие схемы</p>
            <p className="mt-1 text-sm text-white/70">
              Кельтский крест и тематические расклады — когда трёх позиций уже мало.
            </p>
            <Link href="/rasklad/keltskij-krest" className="mt-2 inline-block text-sm text-aura-gold hover:underline">
              Кельтский крест →
            </Link>
          </div>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?ask=1&spread=1" trackGoal="three_cards_cta_click">
          Попробовать первый расклад
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/taro"
          variant="ghost"
          trackGoal="three_cards_cta_click"
          trackParams={{ target: "hub" }}
        >
          Все расклады Таро
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как спросить">
        <p>
          Одна ситуация на расклад. «Что происходит между нами» лучше, чем список из пяти тем.
          После входа вы читаете те же карты — не новый набор «на всякий случай».
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
        extraLinks={[
          { href: "/gadanie/besplatno", label: "Что бесплатно" },
          { href: "/gadanie/karta-dnya", label: "Карта дня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
