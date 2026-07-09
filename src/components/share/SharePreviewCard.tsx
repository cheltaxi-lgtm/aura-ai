"use client";

import { useState } from "react";
import Image from "next/image";
import {
  buildShareLinkPreviewTitle,
  buildSharePreviewBlocks,
  formatShareUrlShort,
} from "@/lib/share/build-url";
import type { ShareKind } from "@/lib/share/types";

interface Props {
  token: string;
  title: string;
  masterName?: string;
  excerpt?: string;
  kind?: ShareKind;
  cards?: string[];
  date?: string;
  cleanUrl: string;
}

function renderBlock(block: ReturnType<typeof buildSharePreviewBlocks>[number], index: number) {
  switch (block.type) {
    case "eyebrow":
      return (
        <p key={`${index}-eyebrow`} className="share-preview-card__eyebrow lux-label">
          {block.text}
        </p>
      );
    case "master":
      return (
        <p key={`${index}-master`} className="share-preview-card__master">
          Мастер <span>{block.name}</span>
        </p>
      );
    case "date":
      return (
        <p key={`${index}-date`} className="share-preview-card__date">
          {block.text}
        </p>
      );
    case "topic":
      return (
        <div key={`${index}-topic`} className="share-preview-card__section">
          <p className="share-preview-card__section-label">Вопрос</p>
          <p className="share-preview-card__quote">«{block.question}»</p>
        </div>
      );
    case "title":
      return (
        <p key={`${index}-title`} className="share-preview-card__spread-title">
          {block.text}
        </p>
      );
    case "symbols":
      return (
        <p key={`${index}-symbols`} className="share-preview-card__symbols">
          <span>Символы</span> {block.names}
        </p>
      );
    case "insight":
      return (
        <div key={`${index}-insight`} className="share-preview-card__section">
          <p className="share-preview-card__section-label">Из расклада</p>
          <p className="share-preview-card__insight">{block.text}</p>
        </div>
      );
    default:
      return null;
  }
}

export default function SharePreviewCard({
  token,
  title,
  masterName,
  excerpt,
  kind,
  cards,
  date,
  cleanUrl,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const ogSrc = `/api/share/${encodeURIComponent(token)}/og?t=${Date.now()}`;
  const input = { title, masterName, excerpt, kind, cards, date };
  const blocks = buildSharePreviewBlocks(input);
  const linkTitle = buildShareLinkPreviewTitle(input);
  const shortUrl = formatShareUrlShort(cleanUrl);

  return (
    <article className="share-preview-card">
      <p className="share-preview-card__hint lux-label">Предпросмотр в Telegram</p>

      <div className="share-preview-card__messenger">
        <div className="share-preview-card__bubble">
          {blocks.map((block, index) => renderBlock(block, index))}
          <div className="share-preview-card__cta">
            <span className="share-preview-card__cta-line" />
            <p>Открыть расклад →</p>
            <p className="share-preview-card__cta-url">{shortUrl}</p>
          </div>
        </div>

        <div className="share-preview-card__link-card">
          {!imageFailed ? (
            <div className="share-preview-card__link-thumb">
              <Image
                src={ogSrc}
                alt=""
                width={1200}
                height={630}
                unoptimized
                className="share-preview-card__link-image"
                onError={() => setImageFailed(true)}
              />
            </div>
          ) : (
            <div className="share-preview-card__link-thumb share-preview-card__link-thumb--fallback" />
          )}
          <div className="share-preview-card__link-meta">
            <p className="share-preview-card__link-title">{linkTitle}</p>
            <p className="share-preview-card__link-domain">zovus.ru</p>
          </div>
        </div>
      </div>
    </article>
  );
}
