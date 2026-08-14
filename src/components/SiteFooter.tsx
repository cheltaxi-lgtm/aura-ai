"use client";

import Link from "next/link";
import LegalDocLink from "@/components/legal/LegalDocLink";
import BrandLogo from "@/components/BrandLogo";
import OAuthProviderIcon from "@/components/auth/OAuthProviderIcon";
import {
  BRAND_DZEN_LABEL,
  BRAND_DZEN_URL,
  BRAND_LOGO_FOOTER,
  BRAND_NAME,
  BRAND_TELEGRAM_LABEL,
  BRAND_VK_LABEL,
  BRAND_VK_URL,
  getBrandTelegramUrl,
  getBrandTelegramUsername,
} from "@/lib/brand";
import { LEGAL_OPERATOR, operatorShortLabel } from "@/lib/legal-operator";
import { SITE_FOOTER_LEGAL_LINE } from "@/lib/master-disclosure";
import { EDITORIAL_FOOTER_TAGLINE, EDITORIAL_NAV } from "@/lib/editorial-landing-content";
import { useAuth } from "@/lib/useAuth";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

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
      <LegalDocLink href="/offer-pro">Оферта Pro</LegalDocLink>
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
  const { proModuleEnabled } = usePlatformFeatures();
  const isLoggedIn = !loading && Boolean(user);
  const telegramUrl = getBrandTelegramUrl();
  const telegramUsername = getBrandTelegramUsername();

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
          <div className="editorial-footer__social" aria-label="Мы в соцсетях">
            <a
              href={BRAND_VK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-footer__social-btn editorial-footer__social-btn--vk"
              aria-label={`${BRAND_VK_LABEL} — группа Zovus`}
            >
              <OAuthProviderIcon provider="vk" className="editorial-footer__social-icon" />
              <span>{BRAND_VK_LABEL}</span>
            </a>
            <a
              href={BRAND_DZEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-footer__social-btn editorial-footer__social-btn--dzen"
              aria-label={`${BRAND_DZEN_LABEL} — канал Zovus`}
            >
              <svg
                className="editorial-footer__social-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.18" />
                <path
                  fill="currentColor"
                  d="M7.2 6.4h3.1c2.9 0 4.7 1.6 4.7 4.1 0 1.7-.8 3-2.1 3.6L16.8 17.6h-3.3l-3.5-3.3H10.3v3.3H7.2V6.4Zm3.1 5.7c1.2 0 1.9-.7 1.9-1.7s-.7-1.7-1.9-1.7H10.3v3.4h-.0Z"
                />
              </svg>
              <span>{BRAND_DZEN_LABEL}</span>
            </a>
            <a
              href="/telegram"
              className="editorial-footer__social-btn editorial-footer__social-btn--telegram"
              aria-label={`${BRAND_TELEGRAM_LABEL} @${telegramUsername}`}
            >
              <svg
                className="editorial-footer__social-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M11.9 2.1c-5.4 0-9.8 4.4-9.8 9.8s4.4 9.8 9.8 9.8 9.8-4.4 9.8-9.8-4.4-9.8-9.8-9.8Zm4.7 6.7-1.6 7.4c-.1.5-.4.6-.9.4l-2.4-1.8-1.2 1.1c-.1.1-.3.3-.5.3l.2-2.5 4.5-4.1c.2-.2 0-.3-.3-.1l-5.6 3.5-2.4-.7c-.5-.2-.5-.5.1-.7l9.3-3.6c.4-.2.8.1.8.8Z"
                />
              </svg>
              <span>{BRAND_TELEGRAM_LABEL}</span>
            </a>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sr-only"
            >
              @{telegramUsername} в Telegram
            </a>
          </div>
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
            <Link href="/partners" className="editorial-footer__link">
              Партнёрам
            </Link>
            <Link href="/auth/expert/register" className="editorial-footer__link">
              Стать мастером
            </Link>
            {proModuleEnabled ? (
              <Link href="/zovus-pro" className="editorial-footer__link">
                Zovus Pro
              </Link>
            ) : null}
          </nav>

          <nav className="editorial-footer__col editorial-footer__col--services" aria-label="Сервисы">
            <p className="editorial-footer__col-title">Сервисы</p>
            <div className="editorial-footer__service-grid">
              {EDITORIAL_NAV.flatMap((item) => {
                if ("hash" in item || item.href === "/cabinet") return [];
                const href = !isLoggedIn && item.guestHref ? item.guestHref : item.href;
                return [
                  <Link key={item.label} href={href} className="editorial-footer__link">
                    {item.label}
                  </Link>,
                ];
              })}
            </div>
          </nav>

          <nav className="editorial-footer__col" aria-label="Документы">
            <p className="editorial-footer__col-title">Документы</p>
            <LegalDocLink href="/offer" className="editorial-footer__link">
              Оферта
            </LegalDocLink>
            <LegalDocLink href="/offer-pro" className="editorial-footer__link">
              Оферта Pro
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
