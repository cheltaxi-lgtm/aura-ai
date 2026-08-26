import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildSeoMetadataWithOverrides } from "@/lib/seo/metadata";
import RuneMeaningTemplate from "@/components/seo/RuneMeaningTemplate";
import { getAllRuneMeaningSlugs, getRuneMeaningBySlug } from "@/lib/seo/rune-meanings";

export function generateStaticParams() {
  return getAllRuneMeaningSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const rune = getRuneMeaningBySlug(slug);
  if (!rune) return { title: "Значение руны" };
  return buildSeoMetadataWithOverrides(`/runy/${slug}`, {
    title: `${rune.name}: значение руны — любовь, деньги | Zovus`,
    description: rune.general,
    path: `/runy/${slug}`,
  });
}

export default async function RuneMeaningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rune = getRuneMeaningBySlug(slug);
  if (!rune) notFound();

  const breadcrumbs = [
    { name: "Zovus", path: "/" },
    { name: "Гадание на рунах", path: "/runy" },
    { name: rune.name, path: `/runy/${slug}` },
  ];

  const faq = [
    {
      question: `Что означает руна «${rune.name}»?`,
      answer: `${rune.name} — ${rune.general}`,
    },
    {
      question: `Руна «${rune.name}» в любви`,
      answer: rune.love,
    },
    {
      question: `Руна «${rune.name}» в деньгах и делах`,
      answer: rune.money,
    },
  ];

  return <RuneMeaningTemplate rune={rune} breadcrumbs={breadcrumbs} faq={faq} />;
}
