import Link from "next/link";
import { SeoPageShell, SeoSection } from "@/components/seo/SeoPageShell";
import SeoBreadcrumbs from "@/components/seo/SeoBreadcrumbs";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";

export default function AboutPageShell({
  title,
  h1,
  intro,
  breadcrumbs,
  children,
}: {
  title: string;
  h1: string;
  intro: string;
  breadcrumbs: BreadcrumbItem[];
  children: React.ReactNode;
}) {
  return (
    <SeoPageShell backHref="/" backLabel="На главную">
      <SeoBreadcrumbs items={breadcrumbs} />
      <p className="text-sm text-aura-gold/80">{title}</p>
      <h1 className="mt-2 font-display text-3xl font-bold">{h1}</h1>
      <p className="mt-4 text-white/70">{intro}</p>
      <div className="mt-8 space-y-8">{children}</div>
      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link href="/about" className="text-aura-gold hover:underline">
          О сервисе
        </Link>
        <Link href="/about/methodology" className="text-aura-gold hover:underline">
          Методика
        </Link>
        <Link href="/about/how-readings-work" className="text-aura-gold hover:underline">
          Как проходит расклад
        </Link>
        <Link href="/faq" className="text-aura-gold hover:underline">
          FAQ
        </Link>
        <Link href="/rasklady" className="text-aura-gold hover:underline">
          Расклады
        </Link>
      </nav>
    </SeoPageShell>
  );
}

export function AboutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SeoSection title={title}>
      <div className="space-y-3">{children}</div>
    </SeoSection>
  );
}
