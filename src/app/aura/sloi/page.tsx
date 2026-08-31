import type { Metadata } from "next";

import { AuraSeoHubList, AuraSeoPage } from "@/components/aura/AuraSeoPage";
import { AURA_LAYER_SEO } from "@/lib/seo/aura-content";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const HUB = {
  slug: "sloi",
  title: "Семь слоёв ауры по Бреннан",
  metaDescription:
    "Семь слоёв поля по Барбаре Бреннан: от эфирного до каузального. Как слои читаются в ауре по фото — с картой и практикой.",
  h1: "Семь слоёв поля по Бреннан",
  intro:
    "Модель Барбары Бреннан — семь слоёв вокруг тела: от жизненной силы до высшего плана. На карте Zovus слои пронумерованы изнутри наружу. Это традиция чтения, не прибор. Каждый слой связан с чакрой и с тем, что видно в полном разборе.",
  sections: [
    {
      heading: "Как пользоваться",
      body: "Выберите слой, чтобы понять этаж. Затем снимите своё поле: легенда назовёт состояние слоя, если разбор оплачен. В тизере видны роли слоёв, не ваш личный статус.",
    },
  ],
  faq: [
    {
      q: "Почему два эфирных слоя?",
      a: "Первый — тонус тела. Пятый, эфирный шаблон, — чертёж воли. Похожие имена, разные этажи.",
    },
  ],
  related: [
    { href: "/aura", title: "Снять ауру по фото" },
    { href: "/aura/chakry", title: "Семь чакр" },
    { href: "/aura/chtenie-ili-kirlian", title: "Чтение или Кирлиан" },
  ],
};

export const metadata: Metadata = buildSeoMetadata({
  title: HUB.title,
  description: HUB.metaDescription,
  path: "/aura/sloi",
});

export default function AuraLayersHubPage() {
  return (
    <AuraSeoPage
      page={HUB}
      path="/aura/sloi"
      goal="aura_layers_hub_view"
      kicker="Аура · Слои поля"
      breadcrumbs={[
        { name: "Zovus", path: "/" },
        { name: "Аура по фото", path: "/aura" },
        { name: "Слои", path: "/aura/sloi" },
      ]}
    >
      <AuraSeoHubList items={AURA_LAYER_SEO} hrefOf={(slug) => `/aura/sloi/${slug}`} />
    </AuraSeoPage>
  );
}
