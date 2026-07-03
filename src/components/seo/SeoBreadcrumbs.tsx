import Link from "next/link";
import type { BreadcrumbItem } from "@/lib/seo/breadcrumbs";
import { buildBreadcrumbJsonLd } from "@/lib/seo/breadcrumbs";

export default function SeoBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = buildBreadcrumbJsonLd(items);
  return (
    <>
      <nav aria-label="Хлебные крошки" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-white/50">
        {items.map((item, i) => (
          <span key={item.path} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>·</span> : null}
            {i === items.length - 1 ? (
              <span className="text-white/70">{item.name}</span>
            ) : (
              <Link href={item.path} className="transition hover:text-aura-gold">
                {item.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
