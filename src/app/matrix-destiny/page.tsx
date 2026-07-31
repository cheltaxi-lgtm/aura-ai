import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getAppUrl } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const CANONICAL_PATH = "/numerology/destiny-matrix";

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Полная матрица судьбы онлайн",
    description:
      "Полная матрица Zovus по дате рождения: комфорт, кармический хвост, каналы, возраст, узел периода — и живой разбор с ведением в Telegram.",
    path: CANONICAL_PATH,
  }),
  alternates: { canonical: `${getAppUrl()}${CANONICAL_PATH}` },
};

/** SEO alias — keep a single canonical product page under /numerology. */
export default function MatrixDestinyAliasPage() {
  permanentRedirect(CANONICAL_PATH);
}
