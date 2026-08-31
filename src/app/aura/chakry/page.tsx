import type { Metadata } from "next";

import { AuraSeoHubList, AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_CHAKRA_SEO } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const HUB = {
  slug: "chakry",
  title: "Семь чакр — состояния в разборе ауры",
  metaDescription:
    "Семь чакр в чтении ауры по фото: от муладхары до сахасрары. Открыта, в балансе или закрыта — в полном разборе. Цвета поля видны сразу.",
  h1: "Семь чакр в карте поля",
  intro:
    "Чакры в Zovus — йогическая семёрка на силуэте карты. Цвет ядра поля виден в тизере. Состояние каждого центра — в полном разборе: так мы не кормим гостя «почти всем» и не ставим медицинских диагнозов.",
  sections: [
    {
      heading: "Как связаны цвет и чакра",
      body: "Красный рифмуется с муладхарой, синий — с горлом, индиго — с аджной. Это рифма, не тождество: красное ядро может стоять при закрытом корне. Поэтому на карте две легенды.",
    },
  ],
  faq: [
    {
      q: "Почему в тизере чакры скрыты?",
      a: "Цвета можно показать честно сразу. Состояние центра — платная глубина полного текста.",
    },
  ],
  related: [
    { href: "/aura", title: "Снять ауру по фото" },
    { href: "/aura/foto-i-chakry", title: "Фото ауры и чакры" },
    { href: "/aura/sloi", title: "Семь слоёв" },
  ],
};

export const metadata: Metadata = buildSeoMetadata({
  title: HUB.title,
  description: HUB.metaDescription,
  path: "/aura/chakry",
});

export default function AuraChakraHubPage() {
  return (
    <AuraSeoPage
      page={HUB}
      path="/aura/chakry"
      goal="aura_chakra_hub_view"
      kicker="Аура · Чакры"
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Аура по фото", path: "/aura" },
        { name: "Чакры", path: "/aura/chakry" },
      ]}
    >
      <AuraSeoHubList items={AURA_CHAKRA_SEO} hrefOf={(slug) => `/aura/chakry/${slug}`} />
    </AuraSeoPage>
  );
}
