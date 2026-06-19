"use client";

import Image from "next/image";
import { useState, useEffect, type CSSProperties } from "react";
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
  const isSvg = src.endsWith(".svg");

  const label = masterName ?? masterId;

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
      body: JSON.stringify({
        sessionId: "f9adef",
        hypothesisId: "A",
        location: "MasterAvatar.tsx:mount",
        message: "avatar render",
        data: { masterId, src, thumb, size, failed },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [masterId, src, thumb, size, failed]);
  // #endregion

  return (
    <div
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
            onError={() => {
              // #region agent log
              fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
                body: JSON.stringify({
                  sessionId: "f9adef",
                  hypothesisId: "A-F",
                  location: "MasterAvatar.tsx:onError",
                  message: "avatar svg failed",
                  data: { masterId, src },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
              setFailed(true);
            }}
            onLoad={() => {
              // #region agent log
              fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
                body: JSON.stringify({
                  sessionId: "f9adef",
                  hypothesisId: "F",
                  location: "MasterAvatar.tsx:onLoad",
                  message: "avatar svg loaded",
                  data: { masterId, src, isSvg: true },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
            }}
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
          className="master-avatar__img object-cover object-[center_18%]"
          loading={priority ? undefined : "lazy"}
          priority={priority}
          onError={() => {
            // #region agent log
            fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
              body: JSON.stringify({
                sessionId: "f9adef",
                hypothesisId: "A",
                location: "MasterAvatar.tsx:onError",
                message: "avatar image failed",
                data: { masterId, src },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            setFailed(true);
          }}
          onLoad={() => {
            // #region agent log
            fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
              body: JSON.stringify({
                sessionId: "f9adef",
                hypothesisId: "A",
                location: "MasterAvatar.tsx:onLoad",
                message: "avatar image loaded",
                data: { masterId, src },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }}
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
