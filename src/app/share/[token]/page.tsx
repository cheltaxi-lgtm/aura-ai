import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND_NAME, getAppUrl } from "@/lib/brand";
import { getShareSnapshotByToken, getShareSnapshotPublic } from "@/lib/share";
import { masterDisplayName } from "@/lib/share-reading";
import ShareLandingTracker from "@/components/share/ShareLandingTracker";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const snapshot = await getShareSnapshotByToken(token, false);
  if (!snapshot) {
    return { title: "Расклад не найден" };
  }

  const { payload } = snapshot;
  const master = payload.masterName ?? (payload.masterKey ? masterDisplayName(payload.masterKey) : "");
  const title = `${payload.title}${master ? ` · ${master}` : ""}`;
  const description =
    payload.excerpt?.slice(0, 160) ||
    "Персональный эзотерический расклад на Zovus — получите свой бесплатно.";

  const url = `${getAppUrl()}/share/${token}`;
  const ogImage = `${getAppUrl()}/api/share/${token}/og`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      locale: "ru_RU",
      url,
      siteName: BRAND_NAME,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ShareLandingPage({ params }: PageProps) {
  const { token } = await params;
  const snapshot = await getShareSnapshotPublic(token);
  if (!snapshot) notFound();

  const { payload, kind } = snapshot;
  const master = payload.masterName ?? (payload.masterKey ? masterDisplayName(payload.masterKey) : "");
  const cards = payload.cards?.map((c) => c.name).join(" · ");
  const ctaHref =
    payload.masterKey != null
      ? `/?master=${encodeURIComponent(payload.masterKey)}`
      : payload.spreadId
        ? `/?spread=${encodeURIComponent(payload.spreadId)}`
        : "/";

  return (
    <main className="share-landing">
      <ShareLandingTracker token={token} kind={kind} />
      <article className="share-landing__card">
        <p className="lux-label">Расклад {BRAND_NAME}</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-white">{payload.title}</h1>
        {master && <p className="mt-2 text-sm text-aura-champagne">{master}</p>}
        {payload.date && <p className="mt-1 text-xs text-white/40">{payload.date}</p>}
        {cards && (
          <p className="mt-4 text-sm text-white/70">
            <span className="text-white/40">Символы: </span>
            {cards}
          </p>
        )}
        {payload.excerpt && (
          <blockquote className="mt-6 border-l-2 border-aura-gold/40 pl-4 text-left text-sm italic leading-relaxed text-white/75">
            {payload.excerpt}
          </blockquote>
        )}
        <Link href={ctaHref} className="btn-luxe btn-luxe--gold share-landing__cta">
          Получить свой расклад
        </Link>
      </article>
    </main>
  );
}
