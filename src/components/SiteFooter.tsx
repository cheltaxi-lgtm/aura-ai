"use client";

import Link from "next/link";
import LegalDocLink from "@/components/legal/LegalDocLink";
import BrandLogo from "@/components/BrandLogo";
import OAuthProviderIcon from "@/components/auth/OAuthProviderIcon";
import { BRAND_LOGO_FOOTER, BRAND_NAME, BRAND_VK_LABEL, BRAND_VK_URL } from "@/lib/brand";
import { navigateToSpreadCatalog } from "@/lib/app-shell-nav";
import { LEGAL_OPERATOR, operatorShortLabel } from "@/lib/legal-operator";
import { SITE_FOOTER_LEGAL_LINE } from "@/lib/master-disclosure";
import { EDITORIAL_FOOTER_TAGLINE, EDITORIAL_NAV } from "@/lib/editorial-landing-content";
import { useAuth } from "@/lib/useAuth";

export type SiteFooterVariant = "minimal" | "marketing";

function FooterDisclaimer() {
  return (
    <p className="site-legal-footer__tagline" role="note">
      {SITE_FOOTER_LEGAL_LINE}{" "}
      <LegalDocLink href="/disclaimer" className="site-legal-footer__more">
        Подробнее
      </LegalDocLink>
    </p>
  );
}

function LegalDocsNav() {
  return (
    <nav className="site-legal-footer__docs" aria-label="Юридические документы">
      <LegalDocLink href="/privacy">ПДн</LegalDocLink>
      <LegalDocLink href="/terms">Соглашение</LegalDocLink>
      <LegalDocLink href="/offer">Оферта</LegalDocLink>
      <LegalDocLink href="/disclaimer">Отказ</LegalDocLink>
      <LegalDocLink href="/app">Приложение</LegalDocLink>
    </nav>
  );
}

function LegalMeta({ year }: { year: number }) {
  return (
    <div className="site-legal-footer__meta">
      <div className="site-legal-footer__identity">
        <span className="site-legal-footer__brand">
          © {year} {BRAND_NAME}
        </span>
        <span className="site-legal-footer__operator">{operatorShortLabel()}</span>
        <LegalDocLink
          href={`mailto:${LEGAL_OPERATOR.contactEmail}`}
          className="site-legal-footer__email"
        >
          {LEGAL_OPERATOR.contactEmail}
        </LegalDocLink>
      </div>
      <LegalDocsNav />
    </div>
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
      <footer className="site-legal-footer site-legal-footer--minimal relative mt-auto">
        <LegalMeta year={year} />
        <FooterDisclaimer />
      </footer>
    );
  }

  return (
    <footer className="editorial-footer site-legal-footer">
      <div className="editorial-footer__inner">
        <div className="editorial-footer__top">
          <BrandLogo {...BRAND_LOGO_FOOTER} />
          <p className="editorial-footer__tagline">{EDITORIAL_FOOTER_TAGLINE}</p>
          <p className="editorial-footer__service-line">18+ · Развлекательный сервис</p>
          <a
            href={BRAND_VK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-footer__vk"
            aria-label={`${BRAND_VK_LABEL} — группа Zovus`}
          >
            <OAuthProviderIcon provider="vk" className="editorial-footer__vk-icon" />
            <span>{BRAND_VK_LABEL}</span>
          </a>
        </div>

        <div className="editorial-footer__columns">
          <nav className="editorial-footer__col" aria-label="Разделы">
            <p className="editorial-footer__col-title">Разделы</p>
            {EDITORIAL_NAV.filter((item) => "hash" in item || item.href === "/cabinet").map(
              (item) => {
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
              }
            )}
            <Link href="/statyi" className="editorial-footer__link">
              Журнал
            </Link>
            <a href="/#партнёрам" className="editorial-footer__link">
              Партнёрам
            </a>
          </nav>

          <nav className="editorial-footer__col" aria-label="Сервисы">
            <p className="editorial-footer__col-title">Сервисы</p>
            {EDITORIAL_NAV.flatMap((item) => {
              if ("hash" in item || item.href === "/cabinet") return [];
              const href = !isLoggedIn && item.guestHref ? item.guestHref : item.href;
              return [
                <Link key={item.label} href={href} className="editorial-footer__link">
                  {item.label}
                </Link>,
              ];
            })}
            <button
              type="button"
              className="editorial-footer__link"
              onClick={() => navigateToSpreadCatalog()}
            >
              Расклады
            </button>
          </nav>

          <nav className="editorial-footer__col" aria-label="Документы">
            <p className="editorial-footer__col-title">Документы</p>
            <LegalDocLink href="/offer" className="editorial-footer__link">
              Оферта
            </LegalDocLink>
            <LegalDocLink href="/privacy" className="editorial-footer__link">
              Конфиденциальность
            </LegalDocLink>
            <LegalDocLink href="/terms" className="editorial-footer__link">
              Соглашение
            </LegalDocLink>
            <LegalDocLink href="/disclaimer" className="editorial-footer__link">
              О сервисе
            </LegalDocLink>
            <LegalDocLink href="/app" className="editorial-footer__link">
              Приложение
            </LegalDocLink>
          </nav>
        </div>

        <div className="editorial-footer__legal">
          <div className="site-legal-footer__identity">
            <span className="site-legal-footer__brand">
              © {year} {BRAND_NAME}
            </span>
            <span className="site-legal-footer__operator">{operatorShortLabel()}</span>
            <LegalDocLink
              href={`mailto:${LEGAL_OPERATOR.contactEmail}`}
              className="site-legal-footer__email"
            >
              {LEGAL_OPERATOR.contactEmail}
            </LegalDocLink>
          </div>
          <FooterDisclaimer />
        </div>
      </div>
    </footer>
  );
}
