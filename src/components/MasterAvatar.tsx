"use client";

import Image from "next/image";
import { useState, useEffect, useRef, type CSSProperties } from "react";
import { getMasterAvatarSlot, masterPortraitSrc, masterPortraitSvgFallback } from "@/data/master-avatars";

export type MasterAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "showcase";

const SIZE_CLASS: Record<MasterAvatarSize, string> = {
  xs: "master-avatar--xs",
  sm: "master-avatar--sm",
  md: "master-avatar--md",
  lg: "master-avatar--lg",
  xl: "master-avatar--xl",
  showcase: "master-avatar--showcase",
};

interface MasterAvatarProps {
  masterId: string;
  masterName?: string;
  size?: MasterAvatarSize;
  thumb?: boolean;
  className?: string;
  hoverZoom?: boolean;
  priority?: boolean;
}

export default function MasterAvatar({
  masterId,
  masterName,
  size = "md",
  thumb = false,
  className = "",
  hoverZoom = false,
  priority = false,
}: MasterAvatarProps) {
  const slot = getMasterAvatarSlot(masterId);
  const primarySrc = masterPortraitSrc(masterId, thumb);
  const svgFallback = masterPortraitSvgFallback(masterId, thumb);
  const [src, setSrc] = useState(primarySrc);
  const [failed, setFailed] = useState(false);
  const isSvg = src.endsWith(".svg");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSrc(primarySrc);
    setFailed(false);
  }, [primarySrc, masterId, thumb]);

  const handleError = () => {
    if (src !== svgFallback && !src.endsWith(".svg")) {
      setSrc(svgFallback);
      return;
    }
    setFailed(true);
  };

  const label = masterName ?? masterId;

  return (
    <div
      ref={rootRef}
      className={`master-avatar ${SIZE_CLASS[size]} ${hoverZoom ? "master-avatar--hover-zoom" : ""} ${className}`.trim()}
      style={{ "--master-avatar-glow": slot.glow } as CSSProperties}
    >
      <div className="master-avatar__frame" aria-hidden />
      <div className="master-avatar__vignette" aria-hidden />
      {!failed ? (
        isSvg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="master-avatar__img master-avatar__img--svg"
            loading={priority ? "eager" : "lazy"}
            onError={handleError}
          />
        ) : (
          <Image
            src={src}
            alt=""
            fill
            sizes={
              size === "showcase"
                ? "(max-width: 640px) 100vw, 320px"
                : size === "xl"
                  ? "96px"
                  : size === "lg"
                    ? "72px"
                    : "48px"
            }
            className={`master-avatar__img ${size === "showcase" ? "object-cover object-[center_14%]" : "object-cover object-[center_18%]"}`}
            loading={priority ? undefined : "lazy"}
            priority={priority}
            onError={handleError}
          />
        )
      ) : (
        <div
          className="master-avatar__fallback"
          style={{
            background: `linear-gradient(165deg, ${slot.moodFrom} 0%, ${slot.moodTo} 55%, #0a0812 100%)`,
          }}
        >
          <span className="master-avatar__monogram font-display">{slot.monogram}</span>
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function MasterAvatarInline({
  masterId,
  masterName,
  size = "sm",
}: {
  masterId: string;
  masterName?: string;
  size?: "xs" | "sm";
}) {
  return (
    <MasterAvatar
      masterId={masterId}
      masterName={masterName}
      size={size}
      thumb
      className="shrink-0"
    />
  );
}
