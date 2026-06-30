"use client";

interface Props {
  token: string;
  title: string;
  masterName?: string;
}

export default function SharePreviewCard({ token, title, masterName }: Props) {
  const ogSrc = `/api/share/${encodeURIComponent(token)}/og?t=${Date.now()}`;

  return (
    <article className="share-preview-card">
      <p className="share-preview-card__hint">Так увидят друзья в мессенджере</p>
      <div className="share-preview-card__og-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ogSrc} alt="" className="share-preview-card__og-image" />
      </div>
      <p className="share-preview-card__hook">
        🔮 Посмотри мой расклад на Zovus
        <br />
        <span className="share-preview-card__hook-title">«{title}»</span>
        {masterName ? (
          <>
            <br />
            <span className="share-preview-card__hook-master">Мастер: {masterName}</span>
          </>
        ) : null}
      </p>
      <p className="share-preview-card__note">Полный текст расклада — только на странице по ссылке</p>
    </article>
  );
}
