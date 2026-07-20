import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getAppUrl } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const CANONICAL_PATH = "/numerology/destiny-matrix";

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Матрица судьбы по дате рождения",
    description:
      "Быстрый разбор личности, денег, отношений и предназначения по дате рождения — авторская матрица судьбы Zovus.",
    path: CANONICAL_PATH,
  }),
  alternates: { canonical: `${getAppUrl()}${CANONICAL_PATH}` },
};

/** SEO alias — keep a single canonical product page under /numerology. */
export default function MatrixDestinyAliasPage() {
  permanentRedirect(CANONICAL_PATH);
}
