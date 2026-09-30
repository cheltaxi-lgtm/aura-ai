import type { Metadata } from "next";
import { Camera, Check, ScanLine, Sparkles } from "lucide-react";
import { PHOTO_READING_GUIDE_STEPS } from "@/lib/photo-reading-guide";
import { BRAND_NAME } from "@/lib/brand";
import { buildPhotoMarkUrl, buildPhotoReadingUrl } from "@/lib/spread-intents/router";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import StarterRunesValue from "@/components/auth/StarterRunesValue";
import PhotoReadingOffer from "@/components/seo/PhotoReadingOffer";

export const metadata: Metadata = buildSeoMetadata({
  title: `Расшифровка Таро по фото онлайн — загрузить расклад | ${BRAND_NAME}`,
  description:
    "Загрузите фото расклада Таро и бесплатно проверьте распознанные карты до регистрации. Полная трактовка по вопросу, сохранение результата и продолжение в чате — после входа.",
  path: "/photo-rasklad",
});

const FAQ = [
  {
    q: "Можно ли начать бесплатно?",
    a: "Да. Загрузка, распознавание и проверка карт бесплатны даже до регистрации. Руны списываются только при запуске полной трактовки после входа.",
  },
  {
    q: "Нужна ли колода Zovus?",
    a: "Нет — подойдёт ваша физическая колода Rider-Waite, Марсель, Ленорман или скриншот из приложения.",
  },
  {
    q: "Как правильно сфотографировать расклад?",
    a: "Камера сверху, все карты в кадре, ровный свет без бликов и размытия. Подробнее — в статье «Как фотографировать расклад».",
  },
  {
    q: "Что если карты распознаны неверно?",
    a: "Перед оплатой проверьте названия, порядок, позиции и перевороты карт. Любую ошибку можно исправить вручную.",
  },
  {
    q: "Где найти готовый разбор?",
    a: "После получения он сохранится в кабинете, в истории раскладов по фото.",
  },
  {
    q: "Сколько стоит полная расшифровка?",
    a: "Действующая цена в рунах и рублях показана в блоке стоимости. Она одинакова для первого и последующих фото-раскладов. Если рун на балансе достаточно, пополнять его не нужно. Итоговую стоимость вы увидите перед началом.",
  },
];

export default function PhotoRaskladPage() {
  return (
    <SeoPageShell
      wide
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Гадание", path: "/gadanie" },
        { name: "Расшифровка по фото", path: "/photo-rasklad" },
      ]}
    >
      <SeoPageTracker goal="photo_landing_view" />
      <section className="relative isolate overflow-hidden rounded-[28px] border border-aura-gold/20 bg-[#141210] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-10 lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-aura-gold/[0.08] blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] lg:gap-14">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-aura-champagne">ФотоТаро · ваш расклад</p>
            <h1 className="mt-5 max-w-2xl font-display text-[clamp(2.7rem,6vw,5rem)] font-medium leading-[0.98] text-aura-ivory">Расшифровка Таро по фото онлайн</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-aura-ivory/70 sm:text-lg">Карты уже лежат перед вами. Загрузите снимок, проверьте, что мы увидели, и получите разбор именно вашего вопроса.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click" pendingLabel="Открываем фото-расклад"><span className="inline-flex items-center gap-2"><Camera size={17} aria-hidden />Загрузить фото расклада</span></SeoTrackedCta>
              <SeoTrackedCta href={buildPhotoMarkUrl()} variant="ghost" trackGoal="photo_landing_cta_click" pendingLabel="Открываем выбор карт">Отметить карты вручную</SeoTrackedCta>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-aura-champagne"><Check size={16} aria-hidden />Распознавание бесплатно · полный разбор после входа</p>
          </div>
          <div className="rounded-[24px] border border-aura-gold/20 bg-[#0a0908] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-7" aria-label="Три шага до расшифровки">
            {[
              { n: "01", title: "Загрузите фото", text: "Своя колода, своя схема, свой вопрос.", Icon: Camera },
              { n: "02", title: "Проверьте карты", text: "Бесплатно уточните названия, позиции и перевороты.", Icon: ScanLine },
              { n: "03", title: "Прочитайте разбор", text: "Увидите цену до списания. Ответ сохранится в кабинете.", Icon: Sparkles },
            ].map(({ n, title, text, Icon }, index) => <div key={n} className={`flex gap-4 py-5 ${index < 2 ? "border-b border-white/10" : ""}`}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-aura-gold/25 bg-aura-gold/10 text-aura-champagne"><Icon size={20} aria-hidden /></span>
              <div><p className="text-[10px] font-semibold tracking-[0.22em] text-aura-gold">{n} / 03</p><h2 className="mt-1 font-display text-2xl text-aura-ivory">{title}</h2><p className="mt-1 text-sm leading-6 text-aura-ivory/55">{text}</p></div>
            </div>)}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-[#141210] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aura-gold">Ваш расклад</p>
          <h2 className="mt-3 font-display text-3xl text-aura-ivory">Не шаблон, а разбор ваших карт</h2>
          <p className="mt-4 leading-7 text-aura-ivory/65">Мастер учитывает подтверждённые карты, позиции и ваш вопрос. Вы проверяете расклад до решения о платной трактовке.</p>
        </div>
        <div className="rounded-3xl border border-aura-gold/30 bg-gradient-to-br from-aura-gold/[0.12] via-[#17130e] to-[#0a0908] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aura-gold">Честная стоимость</p>
          <h2 className="mt-3 font-display text-3xl text-aura-ivory">Сначала проверьте. Потом решите.</h2>
          <div className="mt-5 border-t border-aura-gold/20 pt-4"><PhotoReadingOffer /></div>
          <div className="mt-4 min-h-[2.25rem]"><StarterRunesValue variant="badge" /></div>
        </div>
      </section>

      <details className="mt-8 rounded-2xl border border-aura-gold/20 bg-[#141210] p-5 sm:p-6">
        <summary className="cursor-pointer font-medium text-white">Как подготовить и сфотографировать расклад</summary>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PHOTO_READING_GUIDE_STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-medium text-white">
                {i + 1}. {step.title}
              </p>
              <p className="mt-1 text-sm">{step.text}</p>
            </li>
          ))}
        </ol>
      </details>

      <section className="mt-12" aria-labelledby="photo-faq-title">
        <h2 id="photo-faq-title" className="font-display text-3xl text-aura-ivory">Частые вопросы</h2>
        <div className="mt-5 divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#141210] px-5 sm:px-7">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer font-medium text-aura-ivory">{item.q}</summary>
              <p className="max-w-3xl pt-3 text-sm leading-6 text-aura-ivory/65">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <SeoRelatedTools
        links={[
          { href: "/taro", label: "Таро онлайн" },
          { href: "/rasklady", label: "Каталог раскладов" },
          { href: "/statyi/rasshifrovka-taro-po-foto", label: "Как работает расшифровка" },
          { href: "/statyi/kak-fotografirovat-rasklad-taro", label: "Как фотографировать" },
          { href: "/statyi/besplatnyy-rasklad-taro-online", label: "Бесплатный расклад" },
          { href: "/gadanie", label: "Гадание онлайн" },
        ]}
      />

      <div className="mt-10">
        <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click" trackParams={{ source: "closing" }} pendingLabel="Открываем фото-расклад">
          Загрузить свой расклад
        </SeoTrackedCta>
      </div>

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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: "Расшифровка Таро по фото в Zovus",
            step: PHOTO_READING_GUIDE_STEPS.map((step, index) => ({
              "@type": "HowToStep",
              position: index + 1,
              name: step.title,
              text: step.text,
            })),
          }),
        }}
      />
    </SeoPageShell>
  );
}
