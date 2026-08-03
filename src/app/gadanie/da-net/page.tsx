import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Гадание да или нет онлайн бесплатно | Zovus",
  description:
    "Гадание да или нет онлайн с точным ответом: одна карта Таро или одна руна, вопрос — ответ «да», «нет» или «не сейчас» с пояснением от живого мастера.",
  path: "/gadanie/da-net",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "Гадание да или нет", path: "/gadanie/da-net" },
];

const faq = [
  {
    q: "Как работает гадание да или нет?",
    a: "Вы формулируете один чёткий вопрос («да/нет»-вопрос, не открытый), вытягиваете одну карту Таро или руну, и мастер переводит её значение в прямой ответ с коротким пояснением нюансов.",
  },
  {
    q: "Какой метод точнее — Таро или руны?",
    a: "Оба метода одинаково символичны: Таро даёт немного больше эмоциональных оттенков (78 карт), руны — более лаконичный и прямой ответ (24 символа). Выбирайте по личному отклику.",
  },
  {
    q: "Что делать, если ответ получился спорным?",
    a: "Если карта или руна неоднозначна, или вопрос оказался шире, чем «да/нет», — уточните его в расширенном раскладе на три карты либо обсудите ситуацию с мастером в чате.",
  },
];

export default function GadanieDaNetPage() {
  const structuredData = buildForecastStructuredData({
    title: "Гадание да или нет онлайн",
    description:
      "Гадание да или нет онлайн: одна карта Таро или одна руна — прямой ответ на ваш вопрос.",
    path: "/gadanie/da-net",
    faq,
  });

  return (
    <SeoPageShell backHref="/gadanie" backLabel="Гадание онлайн">
      <SeoPageTracker goal="gadanie_da_net_view" />
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Да или нет</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Гадание да или нет онлайн</h1>
      <p className="mt-4 text-white/70">
        Когда нужен не длинный расклад, а прямой ответ — «да», «нет» или «не сейчас» — быстрее
        всего работает гадание в одну карту или одну руну. Выберите метод, который вам ближе:
      </p>

      <SeoSection title="Выберите метод">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/rasklad/da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Таро да нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна карта Таро, ответ с трактовкой от Вероники или Марины.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Гадать на Таро →</p>
          </Link>
          <Link
            href="/rasklad/runy-da-net"
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/40"
          >
            <p className="font-medium text-white">Руны да нет</p>
            <p className="mt-1 text-sm text-white/70">
              Одна руна старшего Футарка, прямой ответ от Рагнара.
            </p>
            <p className="mt-2 text-sm text-aura-gold">Гадать на рунах →</p>
          </Link>
        </div>
      </SeoSection>

      <div className="mt-8">
        <SeoTrackedCta href="/?spread=yes-no" trackGoal="gadanie_da_net_cta_click">
          Быстрый расклад да / нет
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как карты и руны отвечают «да» или «нет»">
        <p>
          Светлые символы — Солнце, Звезда, Маг, Мир, Колесо Фортуны в Таро или Соулу, Йера,
          Гебо в рунах — чаще читаются как «да». Башня, Луна, Дьявол, Наутиз, Хагалаз или
          перевёрнутые/меркстав-положения — как «нет» или «не сейчас».
        </p>
        <p>
          Многие символы неоднозначны и зависят от вопроса — поэтому мастер учитывает контекст, а
          не только формальную таблицу соответствий.
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
          { href: "/natalnaya-karta", label: "Натальная карта" },
          { href: "/numerology/destiny-matrix", label: "Матрица судьбы" },
          { href: "/runy", label: "Гадание на рунах" },
          { href: "/taro", label: "Таро онлайн" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
