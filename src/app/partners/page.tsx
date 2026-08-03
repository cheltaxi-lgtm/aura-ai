import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import LandingPartnersSection from "@/components/seo/LandingPartnersSection";

export const metadata: Metadata = buildSeoMetadata({
  title: "Партнёрам — колоды и пилот Zovus",
  description:
    "Авторам, издателям и магазинам колод: пилот партнёрства с Zovus — представление колоды в сервисе, ссылка на покупку и индивидуальные условия.",
  path: "/partners",
});

export default function PartnersPage() {
  return (
    <main className="editorial-landing min-h-[70vh] pb-16 pt-8">
      <LandingPartnersSection />
    </main>
  );
}
