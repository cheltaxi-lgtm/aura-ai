import type { Metadata } from "next";

import Link from "next/link";
import AuraReadingFlow from "@/components/aura/AuraReadingFlow";
import { AURA_SEO_CRUMBS } from "@/lib/seo/aura-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { getRuneSettings } from "@/lib/rune-settings";
import { FIRST_AURA_DISCOUNT_RATIO } from "@/lib/aura-reading-billing";

export const dynamic = "force-dynamic";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Аура по фото онлайн — цвета, слои поля и чакры | ${BRAND_NAME}`,
  description:
    "Узнайте цвет своей ауры по фото или с камеры: доминирующие цвета поля, семь слоёв по Бреннан и состояние чакр. Краткий результат бесплатно, цену полного ИИ-разбора покажем заранее.",
  path: "/aura",
});

const FAQ = [
  {
    q: "Как узнать цвет своей ауры по фото?",
    a: "Загрузите портрет крупным планом или снимите себя с камеры при ровном свете. Сервис считывает цветовое поле вокруг фигуры и показывает доминирующий цвет, а мастер даёт полный разбор: семь слоёв поля, чакры и практику на ближайшие дни.",
  },
  {
    q: "Это настоящая аура-фотография?",
    a: "Нет — это символическое чтение по портрету в традициях теософии (Ледбитер), семи слоёв поля Бреннан и йогических чакр, а не съёмка прибором. Мы честно называем метод чтением, а не измерением.",
  },
  {
    q: "Что происходит с моим фото?",
    a: "Фото обрабатывается для снимка ауры и не сохраняется на сервере: остаются только цвета, состояния слоёв и чакр — без изображения лица. Оригинал остаётся на вашем устройстве.",
  },
  {
    q: "Почему при повторной съёмке цвет тот же?",
    a: "Ядро ауры в традиции стабильно неделями. Один снимок себя на календарный день: повтор откроет тот же результат, а не новую лотерею цвета. На следующий день могут сдвинуться слои и чакры — ядро обычно остаётся.",
  },
  {
    q: "Можно снять ауру другого человека?",
    a: "Да. Выберите «Другой человек» и укажите имя. Для каждого человека доступен один результат в день; повтор сегодня откроет уже готовый результат. Файл фото на сервере не хранится.",
  },
  {
    q: "Сколько стоит полный разбор?",
    a: "Один снимок ауры и краткий результат для каждого человека — бесплатно раз в сутки. Полный ИИ-разбор оплачивается отдельно; точную цену первого и повторного разбора показываем до подтверждения. Повтор сегодня откроет тот же текст и не спишет руны снова.",
  },
];

export default async function AuraLandingPage() {
  const settings = await getRuneSettings();
  const cost = settings.costs.AURA_READING;
  const firstCost = Math.max(1, Math.round(cost * FIRST_AURA_DISCOUNT_RATIO));
  const label = RUNE_ACTION_LABELS.AURA_READING;

  return (
    <SeoPageShell breadcrumbs={AURA_SEO_CRUMBS} wide>
      <SeoPageTracker goal="aura_landing_view" funnelProduct="aura" />
      <section className="aura-reading-hero" aria-labelledby="aura-title">
        <div className="aura-reading-hero__copy">
          <p className="aura-reading-hero__eyebrow">Портрет · цвет · состояние</p>
          <h1 id="aura-title" className="aura-reading-hero__title">Аура по фото онлайн</h1>
          <p className="aura-reading-hero__lead">
            Один портрет — ясный снимок вашего цветового поля. Узнайте ведущий цвет
            бесплатно и возвращайтесь к сохранённым результатам в любое время.
          </p>
          <div className="aura-reading-hero__facts" aria-label="Условия разбора">
            <span>Снимок бесплатно раз в сутки</span>
            <span>{label} · {cost} ᚢ</span>
            <span>Первый полный разбор · {firstCost} ᚢ</span>
          </div>
          <div className="aura-reading-hero__actions">
            <a href="#aura-new" className="btn-luxe btn-luxe--md btn-luxe--gold">Сделать снимок</a>
            <a href="#aura-history" className="btn-luxe btn-luxe--md btn-luxe--ghost">Моя история</a>
          </div>
          <p className="aura-reading-hero__note">
            Символическое чтение по портрету, не приборное или медицинское измерение.
          </p>
        </div>
        <div className="aura-reading-hero__art" aria-hidden="true">
          <div className="aura-reading-hero__ring aura-reading-hero__ring--outer" />
          <div className="aura-reading-hero__ring aura-reading-hero__ring--inner" />
          <div className="aura-reading-hero__glow" />
          <span className="aura-reading-hero__art-label">ЦВЕТ · СЛОИ · ЧАКРЫ</span>
        </div>
      </section>

      <section className="aura-flow-host mt-8 sm:mt-10" aria-label="Снимок и история ауры">
        <AuraReadingFlow />
      </section>

      <section className="aura-landing-more" aria-label="Подробнее о чтении ауры">
        <div className="aura-landing-more__grid" id="chto-vhodit">
          <div className="aura-landing-more__card">
            <span className="aura-landing-more__number">01</span>
            <h2>Бесплатный снимок</h2>
            <p>Ведущий цвет и краткое состояние поля. Повтор сегодня откроет тот же результат.</p>
          </div>
          <div className="aura-landing-more__card">
            <span className="aura-landing-more__number">02</span>
            <h2>Полный разбор</h2>
            <p>Семь слоёв, чакры и практика на ближайшие дни — по вашему выбору.</p>
          </div>
          <div className="aura-landing-more__card">
            <span className="aura-landing-more__number">03</span>
            <h2>Личная история</h2>
            <p>Готовые снимки и разборы доступны здесь же, без повторной оплаты.</p>
          </div>
        </div>
        <div className="aura-landing-more__details">
          <details id="kak-snyat">
            <summary>Как подготовить портрет</summary>
            <p>Лицо крупным планом, мягкий ровный свет, без очков и сильных фильтров. Файл фото на сервере не хранится.</p>
          </details>
          <details id="karta-polya">
            <summary>Как читать цвета, слои и чакры</summary>
            <p>
              <Link href="/aura/cveta">Значение цветов</Link> · <Link href="/aura/sloi">Семь слоёв</Link> · <Link href="/aura/chakry">Семь чакр</Link>
            </p>
            <p>
              <Link href="/aura/besplatno">Бесплатный снимок</Link> · <Link href="/aura/kak-uznat-cvet">Как узнать цвет</Link> · <Link href="/aura/chtenie-ili-kirlian">Чтение или Кирлиан</Link> · <Link href="/aura/smeshannoe-pole">Смешанное поле</Link> · <Link href="/aura/foto-i-chakry">Фото и чакры</Link>
            </p>
          </details>
        </div>
      </section>

      <SeoSection title="Вопросы об ауре по фото" id="faq">
        <div className="aura-landing-faq mt-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="aura-landing-faq__item"
            >
              <summary>
                {item.q}
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </SeoSection>

      <details className="aura-landing-related">
        <summary>Другие сервисы Zovus</summary>
        <SeoRelatedTools excludeHrefs={["/aura"]} />
      </details>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
    </SeoPageShell>
  );
}
