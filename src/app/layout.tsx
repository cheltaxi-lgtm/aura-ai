import { Cormorant_Garamond, Inter } from "next/font/google";
import Script from "next/script";
import SalonBackground from "@/components/SalonBackground";
import Providers from "@/components/Providers";
import AppAwareCookieBanner from "@/components/AppAwareCookieBanner";
import AppAwareSiteFooter from "@/components/AppAwareSiteFooter";
import GlobalAppTopHeader from "@/components/GlobalAppTopHeader";
import UtmCapture from "@/components/UtmCapture";
import YandexMetrika from "@/components/YandexMetrika";
import BotMetrikaSnippet from "@/components/seo/BotMetrikaSnippet";
import TelegramWebAppProvider from "@/components/telegram/TelegramWebAppProvider";
import AdsBeaconServer from "@/modules/ads/beacon/AdsBeaconServer";
import { getRootMetadata } from "@/lib/seo";
import "../styles/tokens.css";
import "./globals.css";
import "./app-shell.css";
import "../styles/editorial-landing.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
});

/** Single display face with Cyrillic — used for both font-display and font-mystic-display. */
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mystic-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata = getRootMetadata();
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="font-body relative flex min-h-screen flex-col">
        <Script id="app-shell-detect" strategy="beforeInteractive">
          {`(function(){try{if("scrollRestoration"in history)history.scrollRestoration="manual";if(!location.hash){window.scrollTo(0,0);var de=document.documentElement;if(de)de.scrollTop=0;if(document.body)document.body.scrollTop=0}var cap=window.Capacitor;if(cap&&cap.isNativePlatform&&cap.isNativePlatform()){document.documentElement.dataset.appShell="android";document.documentElement.dataset.nativeApp="1";document.documentElement.dataset.motionLite="1";return}var q=window.location.search;if(/(?:^|[?&])app=1(?:&|$)/.test(q)){document.documentElement.dataset.appShell="android";document.documentElement.dataset.motionLite="1";try{sessionStorage.setItem("zovus_app_shell","1")}catch(e){}}if("serviceWorker"in navigator&&!cap?.isNativePlatform?.()){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister()})});if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){if(k.indexOf("zovus-shell")===0)caches.delete(k)})})}}}catch(e){}})();`}
        </Script>
        <svg width="0" height="0" aria-hidden className="absolute">
          <defs>
            <linearGradient id="lux-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8C77E" />
              <stop offset="100%" stopColor="#C9A24A" />
            </linearGradient>
          </defs>
        </svg>
        <SalonBackground />
        <Providers>
          <TelegramWebAppProvider />
          <GlobalAppTopHeader />
          {/*
            Do not put min-h-0 on the main column by default: it caps height to the
            viewport and lets long landing content paint over the site footer.
            Chat mode re-applies min-h-0 + overflow via body.chat-session-active.
          */}
          <div className="app-main-column relative z-10 w-full flex-1">{children}</div>
          <AppAwareSiteFooter />
        </Providers>
        <UtmCapture />
        <AdsBeaconServer />
        <AppAwareCookieBanner />
        <BotMetrikaSnippet />
        <YandexMetrika />
        {/* SSR marker for Webmaster (NO_METRIKA_COUNTER): noscript only; JS users unaffected. */}
        <noscript>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://mc.yandex.ru/watch/110138367"
              style={{ position: "absolute", left: "-9999px" }}
              alt=""
            />
          </div>
        </noscript>
      </body>
    </html>
  );
}
