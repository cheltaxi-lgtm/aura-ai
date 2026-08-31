import type { ReactNode } from "react";
import Link from "next/link";

import SeoPageTracker from "@/components/seo/SeoPageTracker";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import type { AuraSeoEntry, AuraSeoRelated } from "@/lib/seo/aura-content";

export function AuraSeoPage({
  page,
  path,
  goal,
  breadcrumbs,
  kicker,
  swatch,
  extraRelated,
  children,
}: {
  page: AuraSeoEntry;
  path: string;
  goal: string;
  breadcrumbs: BreadcrumbItem[];
  kicker: string;
  swatch?: string;
  extraRelated?: AuraSeoRelated[];
  children?: ReactNode;
}) {
  const structuredData = buildForecastStructuredData({
    title: page.h1,
    description: page.metaDescription,
    path,
    faq: page.faq,
  });
  const related = extraRelated
    ? [...extraRelated, ...page.related].filter(
        (item, i, arr) => arr.findIndex((x) => x.href === item.href) === i
      )
    : page.related;

  return (
    <SeoPageShell breadcrumbs={breadcrumbs}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SeoPageTracker goal={goal} funnelProduct="aura" funnelSource={goal} />

      <p className="text-sm text-aura-gold/80">{kicker}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{page.h1}</h1>
      {swatch ? (
        <span
          className="mt-4 inline-block h-3.5 w-3.5 rounded-full align-middle shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: swatch, color: swatch }}
          aria-hidden
        />
      ) : null}
      <p className="mt-4 text-white/70">{page.intro}</p>

      <div className="mt-6">
        <SeoTrackedCta
          href="/aura"
          trackGoal="aura_seo_cta"
          trackParams={{ from: path }}
        >
          Снять ауру по фото
        </SeoTrackedCta>
      </div>

      {children}

      {page.sections.map((section) => (
        <SeoSection key={section.heading} title={section.heading}>
          <p>{section.body}</p>
        </SeoSection>
      ))}

      {page.faq.length > 0 ? (
        <SeoSection title="Частые вопросы">
          <div className="space-y-4">
            {page.faq.map((item) => (
              <details
                key={item.q}
                className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <summary className="cursor-pointer text-sm font-medium text-white/85">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm text-white/60">{item.a}</p>
              </details>
            ))}
          </div>
        </SeoSection>
      ) : null}

      <SeoSection title="Дальше по карте поля">
        <ul className="mt-2 space-y-2">
          {related.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-aura-gold underline-offset-4 transition hover:underline"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </SeoSection>
    </SeoPageShell>
  );
}

export function AuraSeoHubList({
  items,
  hrefOf,
}: {
  items: readonly { slug: string; title: string; intro: string }[];
  hrefOf: (slug: string) => string;
}) {
  return (
    <ul className="mt-8 space-y-3">
      {items.map((item) => (
        <li key={item.slug}>
          <Link
            href={hrefOf(item.slug)}
            className="text-aura-gold underline-offset-4 transition hover:underline"
          >
            {item.title}
          </Link>
          <span className="text-white/50">
            {" "}
            — {item.intro.split(".")[0].toLowerCase()}.
          </span>
        </li>
      ))}
    </ul>
  );
}
