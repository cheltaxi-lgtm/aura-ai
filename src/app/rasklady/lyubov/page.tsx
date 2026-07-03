import { notFound } from "next/navigation";
import { getSpreadHubBySlug } from "@/lib/seo/hubs";
import SpreadHubPage, { spreadHubMetadata } from "@/components/seo/SpreadHubPage";

const SLUG = "lyubov";

export function generateMetadata() {
  const hub = getSpreadHubBySlug(SLUG);
  if (!hub) return {};
  return spreadHubMetadata(hub);
}

export default function RaskladyLyubovHubPage() {
  const hub = getSpreadHubBySlug(SLUG);
  if (!hub) notFound();
  return <SpreadHubPage hub={hub} />;
}
