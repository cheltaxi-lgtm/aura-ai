"use client";

import Script from "next/script";

const YANDEX_METRIKA_ID = 110138367;

// Analytics cookies are covered by the implied-consent notice in CookieBanner
// ("continuing to browse the site" = consent) — no explicit opt-in gate here.
// Gating this behind a click-through previously meant the counter script never
// rendered (even the no-JS <img> pixel), so Yandex couldn't verify the counter
// was installed and almost no real traffic was ever measured.
//
// strategy="beforeInteractive" (rather than the default afterInteractive) is
// required here too: afterInteractive scripts are injected client-side after
// hydration and never appear in the raw server-rendered HTML, so Yandex's
// crawler (which mostly reads static HTML) kept reporting the counter as
// "not installed" even though real browsers ran it fine.
export default function YandexMetrika() {
  return (
    <>
      <Script id="yandex-metrika" strategy="beforeInteractive">
        {`(function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');

    ym(${YANDEX_METRIKA_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});`}
      </Script>
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
