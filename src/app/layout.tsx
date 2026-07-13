import { Cormorant_Garamond, Inter, Cinzel } from "next/font/google";
import Script from "next/script";
import MysticBackground from "@/components/MysticBackground";
import Providers from "@/components/Providers";
import AppAwareCookieBanner from "@/components/AppAwareCookieBanner";
import AppAwareSiteFooter from "@/components/AppAwareSiteFooter";
import YandexMetrika from "@/components/YandexMetrika";
import { getRootMetadata } from "@/lib/seo";
import "./globals.css";
import "./app-shell.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mystic-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

export const metadata = getRootMetadata();
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} ${cormorant.variable} ${cinzel.variable}`}>
      <body className="font-body relative flex min-h-screen flex-col">
        <Script id="app-shell-detect" strategy="beforeInteractive">
          {`(function(){try{var cap=window.Capacitor;if(cap&&cap.isNativePlatform&&cap.isNativePlatform()){document.documentElement.dataset.appShell="android";document.documentElement.dataset.motionLite="1";return}var q=window.location.search;if(/(?:^|[?&])app=1(?:&|$)/.test(q)){document.documentElement.dataset.appShell="android";document.documentElement.dataset.motionLite="1";try{sessionStorage.setItem("zovus_app_shell","1")}catch(e){}}if("serviceWorker"in navigator&&!cap?.isNativePlatform?.()){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister()})});if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){if(k.indexOf("zovus-shell")===0)caches.delete(k)})})}}}catch(e){}})();`}
        </Script>
        <svg width="0" height="0" aria-hidden className="absolute">
          <defs>
            <linearGradient id="lux-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E8C77E" />
              <stop offset="100%" stopColor="#C9A24A" />
            </linearGradient>
          </defs>
        </svg>
        <MysticBackground />
        <Providers>
          <div className="app-main-column relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
          <AppAwareSiteFooter />
        </Providers>
        <AppAwareCookieBanner />
        <YandexMetrika />
      </body>
    </html>
  );
}
