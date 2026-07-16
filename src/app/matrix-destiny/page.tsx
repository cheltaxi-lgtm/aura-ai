import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const CANONICAL = "/numerology/destiny-matrix";

export const metadata: Metadata = {
  ...buildSeoMetadata({
    title: "Матрица судьбы по дате рождения",
    description:
      "Быстрый разбор личности, денег, отношений и предназначения по дате рождения — авторская матрица судьбы Zovus.",
    path: CANONICAL,
  }),
  alternates: { canonical: CANONICAL },
};

/** SEO alias — keep a single canonical product page under /numerology. */
export default function MatrixDestinyAliasPage() {
  permanentRedirect(CANONICAL);
}
