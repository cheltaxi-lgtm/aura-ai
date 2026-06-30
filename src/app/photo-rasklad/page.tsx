import type { Metadata } from "next";
import Link from "next/link";
import { PHOTO_READING_GUIDE_STEPS } from "@/lib/photo-reading-guide";
import { DEFAULT_RUNE_COSTS, RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { BRAND_NAME } from "@/lib/brand";
import { buildPhotoReadingUrl } from "@/lib/spread-intents/router";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Фото-расклад Таро онлайн | ${BRAND_NAME}`,
  description:
    "Разложите карты дома, сфотографируйте расклад — Zovus распознает карты и даст персональную трактовку с мастером.",
  path: "/photo-rasklad",
});

export default function PhotoRaskladPage() {
  const cost = DEFAULT_RUNE_COSTS.VISION_ANALYSIS;
  const label = RUNE_ACTION_LABELS.VISION_ANALYSIS;

  return (
    <SeoPageShell>
      <p className="text-sm text-aura-gold/80">Фото-расклад</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Фото-расклад Таро онлайн</h1>
      <p className="mt-4 text-white/70">
        Разложите карты дома, сфотографируйте расклад — мастер Zovus распознает карты, перерисует
        их в колоду сервиса и даст трактовку с возможностью продолжить диалог.
      </p>

      <p className="mt-4 text-sm text-white/50">
        {label} · {cost} ᚢ
      </p>

      <div className="mt-8">
        <SeoTrackedCta href={buildPhotoReadingUrl()} trackGoal="photo_landing_cta_click">
          Загрузить фото расклада
        </SeoTrackedCta>
      </div>

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

      <SeoSection title="Преимущества">
        <ul className="list-disc space-y-2 pl-5">
          <li>Работает с вашей реальной колодой</li>
          <li>Учитывает перевёрнутые карты</li>
          <li>Сохраняет результат в истории</li>
          <li>Можно продолжить диалог с мастером</li>
        </ul>
      </SeoSection>

      <SeoSection title="Частые вопросы">
        <p>
          <strong className="text-white">Нужна ли колода Zovus?</strong> Нет — подойдёт ваша
          физическая колода.
        </p>
        <p>
          <strong className="text-white">Как фотографировать?</strong> Камера строго сверху, все
          карты в кадре, без бликов.
        </p>
      </SeoSection>

      <div className="mt-10">
        <Link href="/rasklady" className="text-sm text-aura-gold hover:underline">
          ← Каталог раскладов
        </Link>
      </div>
    </SeoPageShell>
  );
}
