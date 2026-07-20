"use client";

import { useEffect, useRef, useState } from "react";
import LegalDocLink from "@/components/legal/LegalDocLink";
import {
  acceptCookieConsent,
  declineAnalyticsConsent,
  hasCookieConsentChoice,
} from "@/lib/cookie-consent";

const BODY_CLASS = "cookie-banner-visible";

function syncBannerOffset(banner: HTMLElement | null) {
  if (!banner) return;
  const height = Math.ceil(banner.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--cookie-banner-offset", `${height}px`);
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(!hasCookieConsentChoice());
  }, []);

  useEffect(() => {
    if (!visible) {
      document.body.classList.remove(BODY_CLASS);
      document.documentElement.style.removeProperty("--cookie-banner-offset");
      return;
    }

    const banner = bannerRef.current;
    if (banner) syncBannerOffset(banner);
    document.body.classList.add(BODY_CLASS);

    if (!banner) return;

    const onResize = () => syncBannerOffset(banner);
    const observer = new ResizeObserver(onResize);
    observer.observe(banner);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.body.classList.remove(BODY_CLASS);
      document.documentElement.style.removeProperty("--cookie-banner-offset");
    };
  }, [visible]);

  const accept = () => {
    acceptCookieConsent();
    setVisible(false);
  };

  const necessaryOnly = () => {
    declineAnalyticsConsent();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div ref={bannerRef} className="cookie-banner" role="dialog" aria-label="Уведомление о cookie">
      <div className="cookie-banner__inner">
        <div className="cookie-banner__text">
          Мы используем необходимые cookie для работы сайта. Яндекс Метрика (включая вебвизор и
          карту кликов) подключается только после «Принять аналитику».{" "}
          <LegalDocLink href="/privacy" className="cookie-banner__link">
            Политика конфиденциальности
          </LegalDocLink>
          .
        </div>
        <nav className="cookie-banner__docs" aria-label="Юридические документы">
          <LegalDocLink href="/terms">Соглашение</LegalDocLink>
          <LegalDocLink href="/offer">Оферта</LegalDocLink>
          <LegalDocLink href="/disclaimer">Отказ</LegalDocLink>
        </nav>
        <div className="cookie-banner__actions">
          <button
            type="button"
            onClick={necessaryOnly}
            className="btn-luxe btn-luxe--sm btn-luxe--ghost shrink-0"
          >
            Только необходимые
          </button>
          <button
            type="button"
            onClick={accept}
            className="btn-luxe btn-luxe--sm btn-luxe--gold shrink-0"
          >
            Принять аналитику
          </button>
        </div>
      </div>
    </div>
  );
}
