import type { Metadata } from "next";
import { Inter, Cinzel } from "next/font/google";
import MysticBackground from "@/components/MysticBackground";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Aura — Таро, руны, астрология онлайн",
  description:
    "Маркетплейс эзотерических предсказаний. Карта дня бесплатно, мастера таро и рун, разбор расклада по фото. Оплата через СБП и ЮKassa.",
  keywords: [
    "таро онлайн",
    "гадание онлайн",
    "руны",
    "астрология",
    "эзотерика",
    "оракул",
    "расклад таро",
  ],
  openGraph: {
    title: "Aura — эзотерический оракул",
    description: "Мастера таро, рун и астрологии. Бесплатная карта дня.",
    locale: "ru_RU",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} ${cinzel.variable}`}>
      <body className="font-body relative min-h-screen">
        <MysticBackground />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
