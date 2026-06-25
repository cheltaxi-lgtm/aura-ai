import type { Metadata } from "next";
import HomePage from "@/components/HomePage";
import StructuredData from "@/components/StructuredData";
import { BRAND_URL } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  alternates: {
    canonical: BRAND_URL,
  },
};

/** Главная: онбординг → триплет Таро → выбор наставника */
export default function Page() {
  return (
    <>
      <StructuredData />
      <HomePage />
    </>
  );
}
