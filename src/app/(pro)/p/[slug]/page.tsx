import type { Metadata } from "next";
import { getPublishedLandingBySlug } from "@/modules/pro/db/landings";
import ProMiniLandingClient from "./ProMiniLandingClient";

type Ctx = { params: Promise<{ slug: string }> };

/** OG/title for messenger link previews (Avito → Telegram/WhatsApp shares). */
export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  try {
    const landing = await getPublishedLandingBySlug(slug);
    if (!landing) return { title: "Zovus Pro" };
    const title = `${landing.headline} — ${landing.displayName}`.slice(0, 120);
    const description = (landing.subheadline || "").slice(0, 200) || undefined;
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
    };
  } catch {
    return { title: "Zovus Pro" };
  }
}

export default function ProMiniLandingPage() {
  return <ProMiniLandingClient />;
}
