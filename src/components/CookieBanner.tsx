"use client";

import { useEffect, useRef, useState } from "react";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { acceptCookieConsent, hasCookieConsent } from "@/lib/cookie-consent";

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
    setVisible(!hasCookieConsent());
  }, []);

  useEffect(() => {
    document.body.classList.toggle(BODY_CLASS, visible);
    return () => {
      document.body.classList.remove(BODY_CLASS);
      document.documentElement.style.removeProperty("--cookie-banner-offset");
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const banner = bannerRef.current;
    if (!banner) return;

    syncBannerOffset(banner);

    const onResize = () => syncBannerOffset(banner);
    const observer = new ResizeObserver(onResize);
    observer.observe(banner);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [visible]);

  const accept = () => {
    acceptCookieConsent();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div ref={bannerRef} className="cookie-banner" role="dialog" aria-label="Уведомление о cookie">
      <div className="cookie-banner__inner">
        <div className="cookie-banner__text">
          Мы используем файлы cookie для работы сайта и аналитики. Оставаясь на сайте, вы
          соглашаетесь с{" "}
          <LegalDocLink href="/privacy" className="cookie-banner__link">
            Политикой конфиденциальности
          </LegalDocLink>
          .
        </div>
        <nav className="cookie-banner__docs" aria-label="Юридические документы">
          <LegalDocLink href="/terms">Соглашение</LegalDocLink>
          <LegalDocLink href="/offer">Оферта</LegalDocLink>
          <LegalDocLink href="/disclaimer">Отказ</LegalDocLink>
        </nav>
        <button type="button" onClick={accept} className="btn-luxe btn-luxe--sm btn-luxe--gold shrink-0">
          Понятно
        </button>
      </div>
    </div>
  );
}
