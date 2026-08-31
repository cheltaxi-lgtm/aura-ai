import type { Metadata } from "next";

import { AuraSeoHubList, AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_COLOR_SEO } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const HUB = {
  slug: "cveta",
  title: "Значение цветов ауры",
  metaDescription:
    "Значение цветов ауры: золотой, синий, красный, изумрудный, дымчатый и другие тона поля. Теософская палитра и снимок по фото — без расчёта по дате рождения.",
  h1: "Значение цветов ауры",
  intro:
    "Цвет ядра поля в традиции Ледбитера — качество, а не ярлык. Ниже — те же цвета, что показывает снимок на странице «Аура по фото»: с названием, смыслом и связью с чакрами. Это не тест по дате рождения и не Кирлиан.",
  sections: [
    {
      heading: "Как читать палитру",
      body: "Ядро стабильно неделями. Оттенки и слои могут сдвигаться день ото дня. Смешанное поле — норма: два цвета рядом не «грязь», а живой человек. Дымчатый — пауза, не порча.",
    },
    {
      heading: "Как узнать свой цвет",
      body: "Снимите портрет на /aura. Тизер назовёт ядро и оттенки сразу. Чакры откроются в полном разборе. Фото не хранится.",
    },
  ],
  faq: [
    {
      q: "Сколько цветов в палитре Zovus?",
      a: "Одиннадцать ключей: от золотого и белого до дымчатого. Это продуктовая палитра чтения, не радуга «на любой вкус».",
    },
  ],
  related: [
    { href: "/aura", title: "Снять ауру по фото" },
    { href: "/aura/kak-uznat-cvet", title: "Как узнать цвет ауры" },
    { href: "/aura/chakry", title: "Семь чакр" },
  ],
};

export const metadata: Metadata = buildSeoMetadata({
  title: HUB.title,
  description: HUB.metaDescription,
  path: "/aura/cveta",
});

export default function AuraColorsHubPage() {
  return (
    <AuraSeoPage
      page={HUB}
      path="/aura/cveta"
      goal="aura_colors_hub_view"
      kicker="Аура · Цвета поля"
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Аура по фото", path: "/aura" },
        { name: "Цвета", path: "/aura/cveta" },
      ]}
    >
      <AuraSeoHubList items={AURA_COLOR_SEO} hrefOf={(slug) => `/aura/cveta/${slug}`} />
    </AuraSeoPage>
  );
}
