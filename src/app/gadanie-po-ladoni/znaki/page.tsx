import type { Metadata } from "next";
import Link from "next/link";

import { PALM_MARK_SEO, PALM_SEO_CRUMBS } from "@/lib/seo/palm-content";
import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: `Знаки на ладони — звезда, крест, островок, решётка | ${BRAND_NAME}`,
  description:
    "Знаки на ладони в хиромантии: звезда, крест, островок и решётка. Как читать акценты без порчи — и снять ладонь по фото в Zovus.",
  path: "/gadanie-po-ladoni/znaki",
});

export default function PalmMarksHubPage() {
  return (
    <SeoPageShell
      breadcrumbs={[...PALM_SEO_CRUMBS, { name: "Знаки", path: "/gadanie-po-ladoni/znaki" }]}
    >
      <SeoPageTracker goal="palm_marks_hub" funnelProduct="palm" />
      <p className="text-sm text-aura-gold/80">Хиромантия</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Знаки на ладони</h1>
      <p className="mt-4 text-white/70">
        Четыре знака, которые читает мастер: звезда, крест, островок и решётка. Это акценты зоны,
        не порча и не весь характер. На тизере знаки не раскрываем.
      </p>
      <div className="mt-6">
        <SeoTrackedCta
          href="/gadanie-po-ladoni"
          trackGoal="palm_seo_cta"
          trackParams={{ from: "/gadanie-po-ladoni/znaki" }}
        >
          Снять ладонь
        </SeoTrackedCta>
      </div>
      <SeoSection title="Знаки">
        <ul className="mt-3 space-y-2">
          {PALM_MARK_SEO.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/gadanie-po-ladoni/znaki/${item.slug}`}
                className="text-aura-gold hover:underline"
              >
                {item.h1}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>
    </SeoPageShell>
  );
}
