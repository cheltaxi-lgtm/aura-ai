import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { LENORMAND_COMBINATIONS } from "@/lib/seo/lenormand-combinations";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";

export const metadata: Metadata = buildSeoMetadata({
  title: `Сочетания карт Ленорман — значения пар | ${BRAND_NAME}`,
  description:
    "Как читать пары карт Ленорман в раскладе: любовь, работа, совет — и переход к персональной линии из 5 карт с мастером.",
  path: "/lenormand/sochetaniya",
});

export default function LenormandCombinationsPage() {
  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Ленорман", path: "/lenormand" },
    { name: "Сочетания", path: "/lenormand/sochetaniya" },
  ];

  return (
    <SeoPageShell backHref="/lenormand" backLabel="Ленорман">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Сочетания</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Сочетания карт Ленорман</h1>
      <p className="mt-4 text-white/70">
        Две карты рядом в линии усиливают или уточняют друг друга. Изучите популярные пары — или
        задайте свой вопрос в{" "}
        <Link href="/lenormand" className="text-aura-gold hover:underline">
          раскладе Ленорман
        </Link>
        .
      </p>

      <ul className="mt-10 space-y-4">
        {LENORMAND_COMBINATIONS.map((combo) => (
          <li key={combo.slug}>
            <Link
              href={`/lenormand/sochetaniya/${combo.slug}`}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30"
            >
              <p className="font-medium text-white">{combo.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-white/60">{combo.general}</p>
            </Link>
          </li>
        ))}
      </ul>
    </SeoPageShell>
  );
}
