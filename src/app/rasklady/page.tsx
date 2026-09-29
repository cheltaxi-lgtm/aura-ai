import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
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
    <SeoPageShell
      wide
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Каталог раскладов", path: "/rasklady" },
      ]}
    >
      <SeoPageTracker goal="rasklady_hub_view" />
      <RaskladyCatalog />
      <details className="rasklady-related">
        <summary>Тематические разделы и другие практики</summary>
        <nav aria-label="Тематические разделы раскладов">
          <Link href="/rasklady/lyubov">Любовь</Link>
          <Link href="/rasklady/vernost-i-doverie">Верность и доверие</Link>
          <Link href="/rasklady/chuvstva-i-myisli">Чувства и мысли</Link>
          <Link href="/rasklady/kariera">Карьера</Link>
          <Link href="/rasklady/budushchee">Будущее</Link>
          <Link href="/rasklad">Все схемы</Link>
          <Link href="/cards">Значения карт</Link>
        </nav>
        <SeoRelatedTools excludeHrefs={["/rasklady"]} />
      </details>
    </SeoPageShell>
  );
}
