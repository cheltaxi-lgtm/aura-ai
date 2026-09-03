import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";

export const metadata: Metadata = buildSeoMetadata({
  title: "Карта дня онлайн — одна карта и 3 карты дня | Zovus",
  description:
    "Карта дня онлайн: чем одна карта отличается от трёх карт дня после входа и от первого расклада без регистрации. Таро на сегодня — Zovus.",
  path: "/gadanie/karta-dnya",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Гадание онлайн", path: "/gadanie" },
  { name: "Карта дня", path: "/gadanie/karta-dnya" },
];

const faq = [
  {
    q: "Что такое карта дня в Таро?",
    a: "Одна карта — короткий ориентир на сегодня: настроение дня, где опереться и где не спешить. Это не прогноз на всю жизнь и не замена расклада по конкретному вопросу.",
  },
  {
    q: "Чем 3 карты дня отличаются от первого расклада?",
    a: "Три карты дня — ежедневный ритуал после регистрации, раз в сутки. Первый расклад на главной — три карты по вашему вопросу до регистрации; это не «карта дня» и карты после входа не перетягиваются.",
  },
  {
    q: "Можно ли смотреть карту дня бесплатно?",
    a: "Первый персональный расклад открывается без аккаунта. После входа три карты дня доступны бесплатно раз в сутки. Одна карта как схема — в каталоге раскладов.",
  },
];

export default function GadanieKartaDnyaPage() {
  const structuredData = buildForecastStructuredData({
    title: "Карта дня онлайн",
    description:
      "Карта дня и 3 карты дня: одна карта на сегодня, ежедневный ритуал после входа и первый расклад по вопросу.",
    path: "/gadanie/karta-dnya",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="gadanie_karta_dnya_view" />
      <p className="text-sm text-aura-gold/80">Гадание онлайн · Карта дня</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Карта дня онлайн</h1>
      <p className="mt-4 text-white/70">
        «Карта дня» — это короткий ориентир на сегодня, а не гадание «на всю судьбу». На Zovus есть
        три разных формата: одна карта, ежедневные три карты после входа и первый расклад по вопросу
        без регистрации. Их нельзя смешивать — иначе легко ждать от ритуала ответа на чужой запрос.
      </p>

      <SeoSection title="Три формата — три задачи">
        <div className="grid gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Одна карта дня</p>
            <p className="mt-1 text-sm text-white/70">
              Схема в одну позицию: послание на сегодня. Подходит, когда вопроса ещё нет, а нужен
              тон дня.
            </p>
            <Link href="/rasklady/karta-dnya" className="mt-2 inline-block text-sm text-aura-gold hover:underline">
              Открыть расклад «карта дня» →
            </Link>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">3 карты дня после входа</p>
            <p className="mt-1 text-sm text-white/70">
              Бесплатный ежедневный ритуал в пространстве Zovus: главное, ресурс и осторожность. Не
              путайте его с гостевым раскладом по вопросу.
            </p>
            <Link href="/gadanie/besplatno" className="mt-2 inline-block text-sm text-aura-gold hover:underline">
              Что доступно бесплатно →
            </Link>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Первый расклад по вопросу</p>
            <p className="mt-1 text-sm text-white/70">
              Три карты до регистрации по вашей формулировке. Это знакомство с сервисом, а не карта
              дня. После входа те же карты открываются полностью — без повторного выбора.
            </p>
          </div>
        </div>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/?ask=1&spread=1" trackGoal="gadanie_karta_dnya_cta_click" trackParams={{ target: "first_reading" }}>
          Попробовать первый расклад
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/rasklady/karta-dnya"
          variant="ghost"
          trackGoal="gadanie_karta_dnya_cta_click"
          trackParams={{ target: "one_card" }}
        >
          Одна карта на сегодня
        </SeoTrackedCta>
      </div>

      <SeoSection title="Как читать карту дня, чтобы она помогала">
        <p>
          Сформулируйте, на что смотрите сегодня — настроение, разговор, темп работы. Одна карта не
          отвечает на «вернётся ли он» и не заменяет расклад на отношения. Если вопрос уже есть,
          лучше открыть тему в каталоге, а не ждать от дневного ритуала чужого ответа.
        </p>
        <p>
          Полезно записать одну фразу после карты и вернуться вечером: совпало ли наблюдение. Так
          карта дня становится практикой внимания, а не лотереей.
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
          { href: "/statyi/karta-dnya", label: "Статья: карта дня" },
          { href: "/gadanie/besplatno", label: "Гадание бесплатно" },
          { href: "/taro", label: "Таро онлайн" },
          { href: "/goroskop-na-segodnya", label: "Гороскоп на сегодня" },
          { href: "/rasklady/na-segodnya", label: "Расклад на сегодня" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
