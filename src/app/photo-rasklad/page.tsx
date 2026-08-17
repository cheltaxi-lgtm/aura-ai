import type { Metadata } from "next";
import Link from "next/link";
import { PHOTO_READING_GUIDE_STEPS } from "@/lib/photo-reading-guide";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { BRAND_NAME } from "@/lib/brand";
import { buildPhotoMarkUrl, buildPhotoReadingUrl } from "@/lib/spread-intents/router";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

export const metadata: Metadata = buildSeoMetadata({
  title: `Расшифровка Таро по фото онлайн — загрузить расклад | ${BRAND_NAME}`,
  description:
    "Расшифровка Таро по фото онлайн: загрузите снимок домашнего расклада или отметьте карты вручную — ИИ распознает арканы и перевёрнутые позиции, а мастер даст персональный разбор. Первый фото-расклад со скидкой.",
  path: "/photo-rasklad",
});

const FAQ = [
  {
    q: "Можно ли расшифровать Таро по фото бесплатно?",
    a: "Распознать карты и проверить позиции можно в демо-контуре; полный персональный разбор с мастером — по тарифу. Первый фото-расклад идёт со скидкой 50%. Три карты на главной открываются бесплатно без фото.",
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
    a: `Цикл «распознавание + подтверждение + расшифровка» — ${DEFAULT_RUNE_COSTS.VISION_ANALYSIS} ᚢ. Первый фото-расклад со скидкой 50%.`,
  },
];

export default function PhotoRaskladPage() {
  const cost = DEFAULT_RUNE_COSTS.VISION_ANALYSIS;
  const label = RUNE_ACTION_LABELS.VISION_ANALYSIS;

  return (
    <SeoPageShell>
      <SeoPageTracker goal="photo_landing_view" />
      <SeoBreadcrumbs
        items={[
          { name: "Zovus", path: "/" },
          { name: "Гадание", path: "/gadanie" },
          { name: "Расшифровка по фото", path: "/photo-rasklad" },
        ]}
      />
      <p className="text-sm text-aura-gold/80">Расшифровка по фото</p>
      <h1 className="mt-2 font-display text-3xl font-bold">
        Расшифровка Таро по фото онлайн
      </h1>
      <p className="mt-4 text-white/70">
        Разложили карты дома и хотите понять значение? Загрузите фото расклада или отметьте арканы
        вручную — сервис распознает символы, вы проверите позиции и получите персональную
        расшифровку с возможностью уточнить детали в чате. Это не общий видео-ролик, а разбор
        вашего конкретного расклада.
      </p>

      <p className="mt-4 text-sm text-white/50">
        {label} · {cost} ᚢ · первая расшифровка −50%
      </p>

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

      <SeoSection title="До и после">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-white">До</p>
            <p className="mt-2 text-sm text-white/60">
              Физический расклад на столе или скриншот из приложения — как вы привыкли гадать.
            </p>
          </div>
          <div className="rounded-xl border border-aura-gold/20 bg-aura-gold/5 p-4">
            <p className="font-medium text-aura-gold">После</p>
            <p className="mt-2 text-sm text-white/70">
              Цифровая колода Zovus, проверка позиций, расшифровка мастера и сохранение в кабинете.
            </p>
          </div>
        </div>
      </SeoSection>

      <SeoSection title="Как это работает">
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
      </SeoSection>

      <SeoSection title="Бесплатно и по тарифу — честно">
        <p>
          На{" "}
          <Link href="/taro#besplatno" className="text-aura-gold hover:underline">
            странице Таро
          </Link>{" "}
          и на главной доступен бесплатный расклад на три карты без загрузки фото. Полная
          расшифровка вашего домашнего расклада по снимку — платный цикл с первой скидкой. Подробнее
          о лимитах — в статье{" "}
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
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Каталог раскладов
        </Link>
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
