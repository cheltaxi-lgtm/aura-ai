import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoRelatedTools from "@/components/seo/SeoRelatedTools";
import RaskladyCatalog from "@/components/seo/RaskladyCatalog";

export const metadata: Metadata = buildSeoMetadata({
  title: `Каталог раскладов Таро — готовые вопросы онлайн | ${BRAND_NAME}`,
  description:
    "Каталог раскладов Таро онлайн: любовь, верность, будущее, работа. Выберите готовый вопрос — Zovus подберёт схему и разбор с наставником.",
  path: "/rasklady",
});

export default function RaskladyCatalogPage() {
  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <SeoPageTracker goal="rasklady_hub_view" />
      <SeoBreadcrumbs
        items={[
          { name: "Zovus", path: "/" },
          { name: "Каталог раскладов", path: "/rasklady" },
        ]}
      />
      <p className="text-sm text-aura-gold/80">Каталог раскладов</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Каталог раскладов Таро онлайн</h1>
      <p className="mt-4 text-white/70">
        Выберите готовый вопрос — откроем подходящую схему и разбор. Формулировки про партнёра
        подстраиваются под пол из анкеты: для мужчин «она», для женщин «он». Уже разложили карты
        дома —{" "}
        <Link href="/photo-rasklad" className="text-aura-gold hover:underline">
          расшифруйте фото расклада
        </Link>
        .
      </p>

      <RaskladyCatalog />

      <section className="mt-12 flex flex-wrap gap-3">
        <Link href="/rasklady/lyubov" className="text-sm text-aura-gold hover:underline">
          Любовь и отношения
        </Link>
        <Link href="/rasklady/vernost-i-doverie" className="text-sm text-aura-gold hover:underline">
          Верность
        </Link>
        <Link href="/rasklady/chuvstva-i-myisli" className="text-sm text-aura-gold hover:underline">
          Чувства и мысли
        </Link>
        <Link href="/lenormand" className="text-sm text-aura-gold hover:underline">
          Ленорман
        </Link>
        <Link href="/photo-rasklad" className="text-sm text-aura-gold hover:underline">
          Фото-расклад
        </Link>
        <Link href="/obryady" className="text-sm text-aura-gold hover:underline">
          Обряды
        </Link>
        <Link href="/numerology" className="text-sm text-aura-gold hover:underline">
          Нумерология
        </Link>
        <Link href="/natalnaya-karta" className="text-sm text-aura-gold hover:underline">
          Натальная карта
        </Link>
        <Link href="/numerology/destiny-matrix" className="text-sm text-aura-gold hover:underline">
          Матрица судьбы
        </Link>
        <Link href="/cards" className="text-sm text-aura-gold hover:underline">
          Значения карт
        </Link>
        <Link href="/rasklad" className="text-sm text-aura-gold hover:underline">
          Схемы раскладов
        </Link>
        <Link href="/prognoz" className="text-sm text-aura-gold hover:underline">
          Прогнозы
        </Link>
      </section>

      <div className="mt-10">
        <SeoRelatedTools excludeHrefs={["/rasklady"]} />
      </div>
    </SeoPageShell>
  );
}
