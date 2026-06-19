import HomePage from "@/components/HomePage";

interface MasterPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MasterPageProps) {
  const { slug } = await params;
  return {
    title: `${slug} — Aura`,
    description: `Персональная страница мастера ${slug} на платформе Aura`,
  };
}

export default async function MasterPage({ params }: MasterPageProps) {
  const { slug } = await params;
  return <HomePage referrerSlug={slug} />;
}
