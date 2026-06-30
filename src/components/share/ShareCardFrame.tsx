"use client";

import type { ReactNode } from "react";
import type { ShareCardAspect } from "@/lib/share/card-layout";

interface Props {
  aspect: ShareCardAspect;
  children: ReactNode;
  className?: string;
}

const ASPECT_CLASS: Record<ShareCardAspect, string> = {
  story: "share-card-frame--story",
  og: "share-card-frame--og",
};

export default function ShareCardFrame({ aspect, children, className = "" }: Props) {
  return (
    <div className={`share-card-frame ${ASPECT_CLASS[aspect]} ${className}`.trim()}>
      <div className="share-card-frame__glow" aria-hidden />
      <div className="share-card-frame__inner">{children}</div>
      <p className="share-card-frame__watermark">Zovus.ru</p>
    </div>
  );
}
