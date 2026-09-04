import type { Metadata } from "next";
import Link from "next/link";
import { PHOTO_READING_GUIDE_STEPS } from "@/lib/photo-reading-guide";
import { BRAND_NAME } from "@/lib/brand";
import { buildPhotoMarkUrl, buildPhotoReadingUrl } from "@/lib/spread-intents/router";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import StarterRunesValue from "@/components/auth/StarterRunesValue";
import PhotoReadingOffer from "@/components/seo/PhotoReadingOffer";

export const metadata: Metadata = buildSeoMetadata({
  title: `Расшифровка Таро по фото онлайн — загрузить расклад | ${BRAND_NAME}`,
  description:
    "Загрузите фото своего расклада Таро: ИИ распознает арканы, а вы проверите карты и получите разбор по своему вопросу. Стартовые руны после регистрации, сохранение результата и продолжение в чате.",
  path: "/photo-rasklad",
});

const FAQ = [
  {
    q: "Можно ли расшифровать Таро по фото бесплатно?",
    a: "При первой регистрации начисляются стартовые руны. Ими можно оплатить ФотоТаро без пополнения, если баланса хватает на разбор. Размер подарка и действующая стоимость показаны выше. Перед отправкой фото потребуется вход в аккаунт.",
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
    q: "Что если карты не распознались?",
    a: "Соберите расклад вручную: отметьте карты и позиции перед расшифровкой — смысл не теряется.",
  },
  {
    q: "Сколько стоит полная расшифровка?",
    a: "Действующая цена в рунах и рублях показана в блоке стоимости. Первый фото-расклад со скидкой 50%. Если рун на балансе достаточно, пополнять его не нужно. Итоговую стоимость вы увидите перед началом.",
  },
];

export default function PhotoRaskladPage() {
  return (
    <SeoPageShell
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Гадание", path: "/gadanie" },
        { name: "Расшифровка по фото", path: "/photo-rasklad" },
      ]}
    >
      <SeoPageTracker goal="photo_landing_view" />
      <p className="text-sm text-aura-gold/80">Расшифровка по фото</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Расшифровка Таро по фото онлайн
      </h1>
      <p className="mt-4 text-white/70">
        Загрузите свой расклад и задайте вопрос. Проверьте распознанные карты — получите
        их общий смысл, разбор каждой позиции и следующий шаг. Ответ подготовит ИИ-наставник;
        детали можно уточнить в чате.
      </p>

      <div className="mt-4"><PhotoReadingOffer /></div>

      <div className="mt-8 flex flex-wrap gap-3">
        <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click">
          Загрузить фото расклада
        </SeoTrackedCta>
        <SeoTrackedCta href={buildPhotoMarkUrl()} variant="ghost" trackGoal="photo_landing_cta_click">
          Отметить карты вручную
        </SeoTrackedCta>
      </div>

      {/* Conversion value, client island: renders only with server-confirmed rune
          config. min-h reserves space so the late paint causes no layout shift. */}
      <div className="mt-4 min-h-[2.25rem]">
        <StarterRunesValue variant="badge" />
      </div>

      <SeoSection title="Кому подходит расшифровка по фото">
        <ul className="list-disc space-y-2 pl-5">
          <li>Уже разложили колоду дома и нужна спокойная трактовка без записи к тарологу</li>
          <li>Хотите сохранить свой ритуал (свечи, своя колода), а разбор получить онлайн</li>
          <li>Нужно проверить спорные позиции: прямые и перевёрнутые карты</li>
          <li>Ищете продолжение в диалоге, а не одноразовый шаблонный текст</li>
        </ul>
      </SeoSection>

      <SeoSection title="Что будет в вашем разборе">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">Ваш вопрос и карты</p>
            <p className="mt-2 text-sm text-white/60">
              Фото своей колоды или скриншот. Можно проверить названия, порядок и перевёрнутые
              позиции до расшифровки.
            </p>
          </div>
          <div className="rounded-xl border border-aura-gold/20 bg-aura-gold/5 p-4">
            <p className="font-medium text-aura-gold">Ответ, к которому можно вернуться</p>
            <p className="mt-2 text-sm text-white/70">
              Связь карт с вашим вопросом, смысл их сочетания и варианты следующего шага.
              Расклад сохранится в кабинете; уточнения можно задать в том же чате.
            </p>
          </div>
        </div>
      </SeoSection>

      <SeoSection title="Три шага до расшифровки">
        <ol className="list-decimal space-y-3 pl-5">
          <li>Выберите фото и напишите вопрос. Войдите в аккаунт — черновик вернётся в этой вкладке.</li>
          <li>Запустите распознавание. Проверьте названия и позиции карт, при необходимости исправьте их.</li>
          <li>Подтвердите расклад и прочитайте ответ. Он сохранится вместе с продолжением в чате.</li>
        </ol>
      </SeoSection>

      <details className="mt-8 rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer font-medium text-white">Как подготовить и сфотографировать расклад</summary>
        <ol className="space-y-4">
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

      <SeoSection title="Бесплатно и по тарифу — честно">
        <p>
          ФотоТаро оплачивается рунами с вашего баланса. Для знакомства с сервисом новый аккаунт
          получает стартовые руны; когда их хватает, покупать пакет не требуется. Размер подарка
          и стоимость разбора показаны выше. Подробнее — в статье{" "}
          <Link
            href="/statyi/rasshifrovka-taro-po-foto-besplatno"
            className="text-aura-gold hover:underline"
          >
            «расшифровка по фото бесплатно»
          </Link>
          .
        </p>
      </SeoSection>

      <SeoSection title="Преимущества">
        <ul className="list-disc space-y-2 pl-5">
          <li>Работает с вашей реальной колодой</li>
          <li>Ручная правка, если распознавание ошиблось</li>
          <li>Учитывает перевёрнутые карты</li>
          <li>Стриминг расшифровки — текст появляется по мере чтения</li>
          <li>Озвучка и продолжение в чате с мастером</li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        {FAQ.map((item) => (
          <p key={item.q}>
            <strong className="text-white">{item.q}</strong> {item.a}
          </p>
        ))}
      </SeoSection>

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
        <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click" trackParams={{ source: "closing" }}>
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
