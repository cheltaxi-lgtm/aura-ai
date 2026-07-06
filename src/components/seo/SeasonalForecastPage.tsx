import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import { buildForecastStructuredData } from "@/lib/seo/structured-data";
import type { ForecastMonth } from "@/lib/seo/seasonal";

type ForecastLink = { label: string; href: string };

export type SeasonalForecastPageProps = {
  h1: string;
  intro: string;
  breadcrumbs: BreadcrumbItem[];
  path: string;
  metaTitle: string;
  metaDescription: string;
  themes: string[];
  monthLinks?: ForecastLink[];
  zodiacLinks?: ForecastLink[];
  intentLinks?: ForecastLink[];
  faq: { q: string; a: string }[];
  ctaHref?: string;
  ctaLabel?: string;
  extraSections?: { heading: string; body: string }[];
};

export default function SeasonalForecastPage({
  h1,
  intro,
  breadcrumbs,
  path,
  metaTitle,
  metaDescription,
  themes,
  monthLinks,
  zodiacLinks,
  intentLinks,
  faq,
  ctaHref = "/?spread=triplet",
  ctaLabel = "Сделать расклад на период",
  extraSections,
}: SeasonalForecastPageProps) {
  const structuredData = buildForecastStructuredData({
    title: metaTitle,
    description: metaDescription,
    path,
    breadcrumbs,
    faq,
  });

  return (
    <SeoPageShell backHref="/prognoz" backLabel="Прогнозы">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">Прогноз по картам</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{h1}</h1>
      <p className="mt-4 text-white/70">{intro}</p>

      <SeoSection title="Ключевые темы периода">
        <ul className="list-disc space-y-1 pl-5">
          {themes.map((theme) => (
            <li key={theme}>{theme}</li>
          ))}
        </ul>
      </SeoSection>

      {extraSections?.map((section) => (
        <SeoSection key={section.heading} title={section.heading}>
          <p>{section.body}</p>
        </SeoSection>
      ))}

      {monthLinks && monthLinks.length > 0 ? (
        <SeoSection title="Прогноз по месяцам">
          <ul className="grid gap-2 sm:grid-cols-2">
            {monthLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-aura-gold hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {zodiacLinks && zodiacLinks.length > 0 ? (
        <SeoSection title="Прогноз по знакам зодиака">
          <ul className="flex flex-wrap gap-2">
            {zodiacLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:border-aura-gold/40"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {intentLinks && intentLinks.length > 0 ? (
        <SeoSection title="Расклады по теме">
          <ul className="space-y-2">
            {intentLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-aura-gold hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      <div className="mt-8">
        <SeoTrackedCta href={ctaHref}>{ctaLabel}</SeoTrackedCta>
      </div>

      <SeoSection title="Частые вопросы">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-medium text-white">{item.q}</h3>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </SeoSection>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SeoPageShell>
  );
}

export function buildMonthLinks(year: number, months: ForecastMonth[]) {
  return months.map((m) => ({
    label: `${m.name.charAt(0).toUpperCase()}${m.name.slice(1)} ${year}`,
    href: `/prognoz/${year}/${m.slug}`,
  }));
}
