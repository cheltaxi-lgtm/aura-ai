import LegalDocLink from "@/components/legal/LegalDocLink";
import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/brand";

interface LegalDocumentLayoutProps {
  title: string;
  updatedAt?: string;
  children: ReactNode;
}

export default function LegalDocumentLayout({
  title,
  updatedAt = "28 июня 2026 г.",
  children,
}: LegalDocumentLayoutProps) {
  return (
    <div className="legal-page mx-auto min-h-screen max-w-3xl px-6 py-16 pb-28">
      <LegalDocLink
        href="/"
        className="mb-10 inline-flex min-h-[44px] items-center text-sm text-aura-ivory/45 transition-colors hover:text-aura-champagne"
      >
        ← На главную
      </LegalDocLink>

      <header className="mb-10 border-b border-aura-champagne/15 pb-8">
        <p className="lux-label mb-3 text-aura-champagne/70">{BRAND_NAME}</p>
        <h1 className="font-display lux-heading text-3xl text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-aura-ivory/40">Редакция от {updatedAt}</p>
      </header>

      <article className="legal-prose">{children}</article>

      <nav
        className="legal-page-nav mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/8 pt-8 text-sm"
        aria-label="Другие документы"
      >
        <LegalDocLink href="/privacy" className="text-aura-ivory/50 hover:text-aura-champagne">
          Политика ПДн
        </LegalDocLink>
        <LegalDocLink href="/terms" className="text-aura-ivory/50 hover:text-aura-champagne">
          Соглашение
        </LegalDocLink>
        <LegalDocLink href="/offer" className="text-aura-ivory/50 hover:text-aura-champagne">
          Оферта
        </LegalDocLink>
        <LegalDocLink href="/disclaimer" className="text-aura-ivory/50 hover:text-aura-champagne">
          Отказ от ответственности
        </LegalDocLink>
      </nav>
    </div>
  );
}
