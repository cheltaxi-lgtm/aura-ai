import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";

export const metadata: Metadata = buildSeoMetadata({
  title: `Что входит в бесплатный снимок ауры | ${BRAND_NAME}`,
  description:
    "Бесплатный снимок ауры по фото: доминирующий цвет и короткий тизер. Полный разбор слоёв и чакр — отдельно. Чем это не Кирлиан и не медицинский замер.",
  path: "/aura/besplatno",
});

const breadcrumbs = [
  { name: "Zovus", path: "/" },
  { name: "Аура", path: "/aura" },
  { name: "Бесплатно", path: "/aura/besplatno" },
];

const faq = [
  {
    q: "Что бесплатно в чтении ауры?",
    a: "Снимок на слот и короткий тизер: доминирующий цвет поля. Полный разбор семи слоёв и чакр — по тарифу, первый разбор аккаунта со скидкой 50%.",
  },
  {
    q: "Это измерение приборами?",
    a: "Нет. Это символическое чтение портрета, не Кирлиан и не медицинский замер. Фото лица на сервере не хранится.",
  },
  {
    q: "Почему повтор в тот же день даёт тот же цвет?",
    a: "Один снимок на слот в календарный день. Это не лотерея цвета при каждом кадре.",
  },
];

export default function AuraBesplatnoPage() {
  const cost = DEFAULT_RUNE_COSTS.AURA_READING;
  const structuredData = buildForecastStructuredData({
    title: "Что входит в бесплатный снимок ауры",
    description: "Бесплатный тизер ауры по фото и чем он отличается от полного разбора.",
    path: "/aura/besplatno",
    faq,
  });

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <SeoPageTracker goal="aura_free_view" funnelProduct="aura" />
      <p className="text-sm text-aura-gold/80">Аура · Бесплатно</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Что входит в бесплатный снимок ауры</h1>
      <p className="mt-4 text-white/70">
        Бесплатно — снимок и короткий тизер цвета. Это не полный разбор слоёв и не «ауру навсегда».
        Хаб{" "}
        <Link href="/aura" className="text-aura-gold hover:underline">
          «Аура по фото онлайн»
        </Link>{" "}
        открывает камеру; здесь — честная граница тарифа.
      </p>

      <SeoSection title="Что открывается без оплаты">
        <ul className="list-disc space-y-2 pl-5 text-white/70">
          <li>Снимок поля по портрету или камере</li>
          <li>Доминирующий цвет и короткий тизер</li>
          <li>Один результат на слот в календарный день</li>
        </ul>
      </SeoSection>

      <SeoSection title="Что платно">
        <p>
          Полный разбор — {cost} ᚢ: семь слоёв по Бреннан, чакры и практика на ближайшие дни.
          Первый разбор аккаунта со скидкой 50%. Повтор сегодня откроет тот же текст и не спишет
          руны снова.
        </p>
      </SeoSection>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href="/aura" trackGoal="aura_free_cta_click">
          Снять ауру по фото
        </SeoTrackedCta>
        <SeoTrackedCta
          href="/gadanie/besplatno"
          variant="ghost"
          trackGoal="aura_free_cta_click"
          trackParams={{ target: "all_free" }}
        >
          Все бесплатные форматы
        </SeoTrackedCta>
      </div>

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
          { href: "/aura/cveta", label: "Цвета ауры" },
          { href: "/aura/chtenie-ili-kirlian", label: "Чтение или Кирлиан" },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}
