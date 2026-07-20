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
    title: "Расклад Таро онлайн — приватный салон | Zovus",
    description:
      "Приватные расклады Таро с ИИ-наставниками: связь, решение, работа, будущее. Разбор в чате, уточнения и история в кабинете.",
    path: "/",
  }),
  title: {
    absolute: "Расклад Таро онлайн — приватный салон | Zovus",
  },
  alternates: {
    canonical: BRAND_URL,
  },
};

/** Главная: guest spread → регистрация → мастер. SEO-текст — sr-only в конце. */
export default function Page() {
  return (
    <>
      <StructuredData />
      <HomePage />
      <HomeSeoContent />
    </>
  );
}
