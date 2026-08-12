import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import HomeSeoContent from "@/components/seo/HomeSeoContent";
import StructuredData from "@/components/StructuredData";
import { BRAND_URL } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

/** Cached marketing shell; auth/session logic is client-side in HomePage. */
export const revalidate = 3600;

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Матрица судьбы, Натальная карта, Дизайн человека и Таро",
    description:
      "Zovus — персональные AI-разборы и расчёты: матрица судьбы, натальная карта, дизайн человека и Таро. Бесплатные калькуляторы и три карты до регистрации.",
    path: "/",
  }),
  title: {
    absolute: "Zovus — Матрица судьбы, Натальная карта, Дизайн человека и Таро",
  },
  alternates: {
    canonical: BRAND_URL,
  },
};

/** Главная: multiproduct platform → guest Tarot / birth tools. SEO — sr-only в конце. */
export default function Page() {
  return (
    <>
      <StructuredData />
      <HomePage />
      <HomeSeoContent />
    </>
  );
}
