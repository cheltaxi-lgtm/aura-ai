"use client";

import Link from "next/link";
import LegalDocLink from "@/components/legal/LegalDocLink";
import BrandLogo from "@/components/BrandLogo";
import { BRAND_LOGO_FOOTER, BRAND_NAME } from "@/lib/brand";
import { navigateToNatalChart, navigateToSpreadCatalog } from "@/lib/app-shell-nav";
import { LEGAL_OPERATOR, operatorShortLabel } from "@/lib/legal-operator";
import { SITE_FOOTER_LEGAL_LINE } from "@/lib/master-disclosure";
import { EDITORIAL_FOOTER_TAGLINE, EDITORIAL_NAV } from "@/lib/editorial-landing-content";
import { useAuth } from "@/lib/useAuth";

export type SiteFooterVariant = "minimal" | "marketing";

function LegalLinksRow({ year }: { year: number }) {
  return (
    <>
      <nav className="site-legal-footer__links" aria-label="Юридические документы">
        <span className="site-legal-footer__brand">
          © {year} {BRAND_NAME}
        </span>
        <span className="site-legal-footer__operator">{operatorShortLabel()}</span>
        <LegalDocLink href={`mailto:${LEGAL_OPERATOR.contactEmail}`} className="site-legal-footer__email">
          {LEGAL_OPERATOR.contactEmail}
        </LegalDocLink>
        <LegalDocLink href="/privacy">ПДн</LegalDocLink>
        <LegalDocLink href="/terms">Соглашение</LegalDocLink>
        <LegalDocLink href="/offer">Оферта</LegalDocLink>
        <LegalDocLink href="/disclaimer">Отказ</LegalDocLink>
        <LegalDocLink href="/app">Приложение</LegalDocLink>
      </nav>
      <p className="site-legal-footer__tagline" role="note">
        {SITE_FOOTER_LEGAL_LINE}{" "}
        <LegalDocLink href="/disclaimer" className="text-aura-ivory/55 hover:text-aura-champagne">
          Подробнее
        </LegalDocLink>
      </p>
    </>
  );
}

export default function SiteFooter({
  variant = "minimal",
}: {
  variant?: SiteFooterVariant;
}) {
  const year = new Date().getFullYear();
  const { user, loading } = useAuth();
  const isLoggedIn = !loading && Boolean(user);

  if (variant === "minimal") {
    return (
      <footer className="site-legal-footer relative mt-auto">
        <LegalLinksRow year={year} />
      </footer>
    );
  }

  return (
    <footer className="editorial-footer site-legal-footer">
      <div className="editorial-footer__top">
        <BrandLogo {...BRAND_LOGO_FOOTER} />
        <p className="editorial-footer__tagline">{EDITORIAL_FOOTER_TAGLINE}</p>
      </div>

      <nav className="editorial-footer__nav" aria-label="Навигация в подвале">
        {EDITORIAL_NAV.map((item) => {
          if ("hash" in item) {
            return (
              <a key={item.label} href={`#${item.hash}`} className="editorial-footer__link">
                {item.label}
              </a>
            );
          }
          const href = !isLoggedIn && item.guestHref ? item.guestHref : item.href;
          return (
            <Link key={item.label} href={href} className="editorial-footer__link">
              {item.label}
            </Link>
          );
        })}
        <button type="button" className="editorial-footer__link" onClick={() => navigateToSpreadCatalog()}>
          Расклады
        </button>
        <button type="button" className="editorial-footer__link" onClick={() => navigateToNatalChart()}>
          Натал
        </button>
        <Link href="/statyi" className="editorial-footer__link">
          Журнал
        </Link>
      </nav>

      <div className="editorial-footer__legal">
        <LegalLinksRow year={year} />
      </div>
    </footer>
  );
}
