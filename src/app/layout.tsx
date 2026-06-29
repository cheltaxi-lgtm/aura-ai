import { Cormorant_Garamond, Inter, Cinzel } from "next/font/google";
import MysticBackground from "@/components/MysticBackground";
import Providers from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import SiteFooter from "@/components/SiteFooter";
import YandexMetrika from "@/components/YandexMetrika";
import { getRootMetadata } from "@/lib/seo";
import "./globals.css";

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
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
          <SiteFooter />
        </Providers>
        <CookieBanner />
        <YandexMetrika />
      </body>
    </html>
  );
}
