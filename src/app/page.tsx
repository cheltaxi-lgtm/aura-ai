import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import HomeSeoContent from "@/components/seo/HomeSeoContent";
import StructuredData from "@/components/StructuredData";
import { BRAND_URL } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Расклад Таро онлайн — приватный салон | Zovus",
    description:
      "Приватные расклады Таро с ИИ-наставниками: связь, решение, работа, будущее. Разбор в чате, уточнения и история в кабинете.",
    path: "/",
  }),
  // `force-dynamic` on this route means the root layout's `title.template`
  // isn't reliably applied to a plain string title, so pin the fully
  // resolved string here to guarantee the brand suffix renders exactly once.
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
