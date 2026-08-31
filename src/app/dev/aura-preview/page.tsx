import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AuraPreviewClient from "./AuraPreviewClient";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Aura preview",
  description: "Internal visualization QA — not for search.",
  path: "/dev/aura-preview",
  noIndex: true,
});

export default function AuraPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AuraPreviewClient />;
}
