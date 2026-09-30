import type { Metadata } from "next";

import Link from "next/link";
import PalmReadingFlow from "@/components/palm/PalmReadingFlow";
import { PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Гадание по ладони онлайн — хиромантия по фото | ${BRAND_NAME}`,
  description:
    "Гадание по ладони онлайн: снимите ладонь или загрузите фото. Тип руки, линии жизни, ума, сердца и судьбы, холмы. Символическая хиромантия — первый разбор со скидкой 50%.",
  path: "/gadanie-po-ladoni",
});

const FAQ = [
  {
    q: "Как гадать по ладони онлайн?",
    a: "Раскройте ладонь пальцами вверх при ровном свете и снимите её с камеры или загрузите фото. Сервис покажет тип руки и краткий результат, а мастер даст полный разбор линий и холмов.",
  },
  {
    q: "Это настоящая хиромантия или ИИ?",
    a: "Это символическое чтение рисунка ладони в классической западной хиромантии: четыре типа руки, главные линии и холмы. Мы честно называем метод чтением, а не измерением и не медициной.",
  },
  {
    q: "Что происходит с моим фото?",
    a: "Фото обрабатывается для снимка ладони и не сохраняется на сервере: остаются только тип руки, линии и холмы. Оригинал остаётся на вашем устройстве.",
  },
  {
    q: "Можно снять обе ладони?",
    a: "Да. Левая и правая ладони — отдельные снимки. Повтор той же ладони сегодня откроет уже готовый результат. Старый снимок можно удалить в «Истории ладоней».",
  },
  {
    q: "Сколько стоит полный разбор?",
    a: "Снимок и краткий результат — бесплатно. Актуальную цену полного разбора показываем до подтверждения; на первый разбор действует скидка 50%. Каждая ладонь оплачивается отдельно, повторное открытие уже оплаченного снимка не спишет руны снова.",
  },
];

export default function PalmLandingPage() {
  return (
    <SeoPageShell breadcrumbs={PALM_SEO_CRUMBS} wide>
      <SeoPageTracker goal="palm_landing_view" funnelProduct="palm" />
      <section className="palm-reading-hero" aria-labelledby="palm-title">
        <div className="palm-reading-hero__copy">
          <p className="palm-reading-hero__eyebrow">Форма · линии · холмы</p>
          <h1 id="palm-title" className="palm-reading-hero__title">Гадание по ладони</h1>
          <p className="palm-reading-hero__lead">
            Узнайте тип руки и главные линии по снимку ладони. Краткий результат бесплатно,
            полный разбор — по вашему выбору.
          </p>
          <div className="palm-reading-hero__facts" aria-label="Условия разбора">
            <span>Каждая ладонь · бесплатно раз в сутки</span>
            <span>Цена полного разбора — до подтверждения</span>
            <span>Первый полный разбор −50%</span>
          </div>
          <div className="palm-reading-hero__actions">
            <a href="#palm-new" className="btn-luxe btn-luxe--md btn-luxe--gold">Сделать снимок</a>
            <a href="#palm-history" className="btn-luxe btn-luxe--md btn-luxe--ghost">Моя история</a>
          </div>
          <p className="palm-reading-hero__note">
            Символическое чтение по рисунку ладони, не приборное или медицинское исследование. 18+.
          </p>
        </div>
        <div className="palm-reading-hero__art" aria-hidden="true">
          <div className="palm-reading-hero__ring palm-reading-hero__ring--outer" />
          <div className="palm-reading-hero__ring palm-reading-hero__ring--inner" />
          <svg viewBox="0 0 320 320" fill="none" className="palm-reading-hero__lines">
            <path d="M70 195c49-27 115-29 180 8" />
            <path d="M78 155c48-42 109-52 174-17" />
            <path d="M114 255c14-74 56-134 116-192" />
            <path d="M155 260c-14-52-12-95 10-137" />
            <path d="M97 228c32-6 57-5 91 10" className="palm-reading-hero__line-dashed" />
          </svg>
          <span className="palm-reading-hero__art-label">ЛИНИИ · ХОЛМЫ · ТИП РУКИ</span>
        </div>
      </section>

      <section className="palm-flow-host mt-8 sm:mt-10" aria-label="Снимок и история ладоней">
        <PalmReadingFlow />
      </section>

      <section className="palm-landing-more" aria-label="Как устроен разбор ладони">
        <div className="palm-landing-more__grid">
          <div className="palm-landing-more__card">
            <span className="palm-landing-more__number">01</span>
            <h2>Бесплатный снимок</h2>
            <p>Тип руки и короткое чтение. Повтор той же ладони сегодня откроет прежний результат.</p>
          </div>
          <div className="palm-landing-more__card">
            <span className="palm-landing-more__number">02</span>
            <h2>Полный разбор</h2>
            <p>Линии жизни, ума и сердца, холмы и знаки — только после вашего подтверждения.</p>
          </div>
          <div className="palm-landing-more__card">
            <span className="palm-landing-more__number">03</span>
            <h2>Личная история</h2>
            <p>Сохранённые снимки и разборы доступны на этой странице без повторной оплаты.</p>
          </div>
        </div>
        <div className="palm-landing-more__details" id="karta-ladoni">
          <details>
            <summary>Линии, холмы и типы рук</summary>
            <p><Link href="/gadanie-po-ladoni/linii">Главные линии</Link> · <Link href="/gadanie-po-ladoni/kholmy">Холмы ладони</Link> · <Link href="/gadanie-po-ladoni/tipy-ruk">Типы рук</Link> · <Link href="/gadanie-po-ladoni/znaki">Знаки</Link></p>
          </details>
          <details>
            <summary>Как подготовить снимок</summary>
            <p><Link href="/gadanie-po-ladoni/po-foto">Съёмка по фото</Link> · <Link href="/gadanie-po-ladoni/levaya">Левая ладонь</Link> · <Link href="/gadanie-po-ladoni/pravaya">Правая ладонь</Link> · <Link href="/gadanie-po-ladoni/kak-chitat">Как читать</Link></p>
          </details>
        </div>
      </section>

      <SeoSection title="Частые вопросы" id="faq">
        <div className="palm-landing-faq mt-3">
          {FAQ.map((item) => (
            <details key={item.q} className="palm-landing-faq__item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </SeoSection>

      <details className="palm-landing-related">
        <summary>Другие способы узнать себя</summary>
        <div className="palm-landing-related__links">
          <Link href="/gadanie-po-ladoni/lyubov">На любовь</Link> · <Link href="/gadanie-po-ladoni/sudba">На судьбу</Link> · <Link href="/gadanie-po-ladoni/karera">На карьеру</Link> · <Link href="/gadanie-po-ladoni/besplatno">Что бесплатно</Link>
        </div>
        <SeoRelatedTools excludeHrefs={["/gadanie-po-ladoni"]} />
      </details>
    </SeoPageShell>
  );
}
