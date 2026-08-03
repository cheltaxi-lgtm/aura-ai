import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getAppUrl } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const CANONICAL_PATH = "/natalnaya-karta";

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Натальная карта онлайн — расчёт и расшифровка",
    description:
      "Натальная карта по дате, времени и месту рождения: западная астрология и джйотиш в Zovus.",
    path: CANONICAL_PATH,
  }),
  alternates: { canonical: `${getAppUrl()}${CANONICAL_PATH}` },
};

/** SEO alias — canonical product landing is /natalnaya-karta. */
export default function AstrologyAliasPage() {
  permanentRedirect(CANONICAL_PATH);
}
