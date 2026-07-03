"use client";



import { buildSharePreviewLines } from "@/lib/share/build-url";



interface Props {

  token: string;

  title: string;

  masterName?: string;

  cleanUrl: string;

}



export default function SharePreviewCard({ token, title, masterName, cleanUrl }: Props) {

  const ogSrc = `/api/share/${encodeURIComponent(token)}/og?t=${Date.now()}`;

  const lines = buildSharePreviewLines(title, masterName);



  return (

    <article className="share-preview-card">

      <p className="share-preview-card__hint">Так увидят друзья в мессенджере</p>

      <div className="share-preview-card__og-wrap">

        {/* eslint-disable-next-line @next/next/no-img-element */}

        <img

          src={ogSrc}

          alt=""

          className="share-preview-card__og-image"

          onError={(e) => {

            e.currentTarget.style.display = "none";

          }}

        />

      </div>

      <div className="share-preview-card__hook">

        {lines.map((line, i) => (

          <p

            key={`${i}-${line.slice(0, 12)}`}

            className={

              i === 1

                ? "share-preview-card__hook-title"

                : i === 2 && line.startsWith("Мастер:")

                  ? "share-preview-card__hook-master"

                  : undefined

            }

          >

            {line}

          </p>

        ))}

      </div>

      <p className="share-preview-card__url">{cleanUrl}</p>

      <p className="share-preview-card__note">

        Полный текст расклада — только на странице по ссылке. Кнопка «Ссылка» копирует чистый URL без UTM.

      </p>

    </article>

  );

}


