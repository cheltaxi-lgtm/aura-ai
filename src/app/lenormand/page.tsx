import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import LenormandCatalog from "@/components/seo/LenormandCatalog";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoPageTracker from "@/components/seo/SeoPageTracker";

export const metadata: Metadata = buildSeoMetadata({
  title: `Ленорман онлайн — линия из 5 карт и расклады | ${BRAND_NAME}`,
  description:
    "Онлайн-расклады Ленорман: линия из пяти карт, быстрые ответы на любовь, работу и сроки. Персональная расшифровка с мастером Zovus.",
  path: "/lenormand",
});

export default function LenormandHubPage() {
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Ленорман", path: "/lenormand" },
  ];

  return (
    <SeoPageShell backHref="/rasklady" backLabel="Каталог раскладов">
      <SeoPageTracker goal="lenormand_hub_view" />
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Колода Ленорман</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Расклады Ленорман онлайн</h1>
      <p className="mt-4 text-white/70">
        Ленорман — прямая колода: меньше символизма, больше конкретики. Линия из пяти карт показывает
        основу, развитие, ядро ситуации, исход и ключ — наставник Zovus свяжет позиции в связный ответ
        и продолжит диалог в чате.
      </p>

      <LenormandCatalog />

      <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-display text-lg text-white">Чем Ленорман отличается от Таро</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Таро глубже в архетипах и психологии; Ленорман быстрее отвечает на «что будет» и «когда».
          На Zovus можно начать с линии Ленорман и уточнить детали у мастера — память сессии сохраняется.
        </p>
        <Link href="/lenormand/sochetaniya" className="mt-3 inline-block text-sm text-aura-gold hover:underline">
          Сочетания пар Ленорман →
        </Link>
      </section>
    </SeoPageShell>
  );
}
