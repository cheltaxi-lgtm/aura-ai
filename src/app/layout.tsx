import Script from "next/script";
import { Cormorant_Garamond, Inter, Cinzel } from "next/font/google";
import MysticBackground from "@/components/MysticBackground";
import Providers from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import SiteFooter from "@/components/SiteFooter";
import { getRootMetadata } from "@/lib/seo";
import "./globals.css";

const YANDEX_METRIKA_ID = 110138367;
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
          <div className="relative z-10 flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </Providers>
        <CookieBanner />

        {/* Yandex.Metrika counter */}
        <Script id="yandex-metrika" strategy="afterInteractive">
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
        {/* /Yandex.Metrika counter */}
      </body>
    </html>
  );
}
