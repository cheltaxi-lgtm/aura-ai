import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND_NAME, getAppUrl } from "@/lib/brand";
import { buildShareHook } from "@/lib/share/build-url";
import { getShareSnapshotByToken, getShareSnapshotPublic } from "@/lib/share";
import { masterDisplayName } from "@/lib/share-reading";
import ShareLandingTracker from "@/components/share/ShareLandingTracker";
import ShareLandingActions from "@/components/share/ShareLandingActions";

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
  const description = buildShareHook(payload.title, master || undefined);

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
  const shareUrl = `${getAppUrl()}/share/${token}`;

  return (
    <main className="share-landing">
      <ShareLandingTracker token={token} kind={kind} />
      <article className="share-landing__card">
        <p className="lux-label share-landing__label">Расклад {BRAND_NAME}</p>
        <h1 className="share-landing__title">{payload.title}</h1>
        {master && <p className="share-landing__master">{master}</p>}
        {payload.date && <p className="share-landing__date">{payload.date}</p>}
        {cards && (
          <p className="share-landing__cards">
            <span className="share-landing__cards-label">Символы: </span>
            {cards}
          </p>
        )}
        {payload.excerpt ? (
          <div className="share-landing__body">
            <p className="share-landing__body-label">Полный расклад</p>
            {payload.excerptTruncated ? (
              <p className="share-landing__truncated-note">
                Текст сокращён для безопасного хранения. Создайте новую ссылку из кабинета для полной версии.
              </p>
            ) : null}
            <div className="share-landing__excerpt-wrap">
              <div className="share-landing__excerpt">{payload.excerpt}</div>
            </div>
          </div>
        ) : null}
        <ShareLandingActions token={token} kind={kind} shareUrl={shareUrl} ctaHref={ctaHref} />
      </article>
    </main>
  );
}
