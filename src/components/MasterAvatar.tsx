"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { getMasterAvatarSlot, masterPortraitSrc } from "@/data/master-avatars";

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
  const src = masterPortraitSrc(masterId, thumb);
  const [failed, setFailed] = useState(false);

  const label = masterName ?? masterId;

  return (
    <div
      className={`master-avatar ${SIZE_CLASS[size]} ${hoverZoom ? "master-avatar--hover-zoom" : ""} ${className}`.trim()}
      style={{ "--master-avatar-glow": slot.glow } as CSSProperties}
    >
      <div className="master-avatar__frame" aria-hidden />
      <div className="master-avatar__vignette" aria-hidden />
      {!failed ? (
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
          className="master-avatar__img object-cover object-[center_18%]"
          loading={priority ? undefined : "lazy"}
          priority={priority}
          onError={() => setFailed(true)}
        />
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
