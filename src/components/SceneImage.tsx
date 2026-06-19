"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, X, ZoomIn } from "lucide-react";
import { resolveSceneArtDisplayUrl } from "@/lib/scene-art-url";

interface SceneImageProps {
  imageUrl: string | null;
  loading?: boolean;
  label?: string;
  aspectClass?: string;
  objectFit?: "cover" | "contain";
  className?: string;
  /** Портретная «карта» — целиком, без обрезки, с лайтбоксом */
  variant?: "card" | "wide";
  expandable?: boolean;
}

export default function SceneImage({
  imageUrl,
  loading = false,
  label,
  aspectClass = "aspect-video",
  objectFit = "contain",
  className = "",
  variant = "wide",
  expandable = false,
}: SceneImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const displayUrl = resolveSceneArtDisplayUrl(imageUrl);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen]);

  if (!loading && !displayUrl) return null;

  const isCard = variant === "card";
  const canExpand = expandable && !!displayUrl && !loading;

  const lightbox =
    lightboxOpen && displayUrl ? (
      <motion.div
        data-scene-lightbox
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setLightboxOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? "Изображение на весь экран"}
      >
        <button
          type="button"
          onClick={() => setLightboxOpen(false)}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white transition-colors hover:bg-white/10"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>

        {label && (
          <p className="absolute left-4 top-4 z-10 text-xs uppercase tracking-widest text-gray-400">
            {label}
          </p>
        )}

        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="max-h-[92vh] max-w-[min(520px,92vw)]"
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            src={displayUrl}
            alt={label ?? "Aura art"}
            width={520}
            height={780}
            unoptimized
            className="max-h-[92vh] w-full object-contain drop-shadow-[0_0_40px_rgba(168,85,247,0.25)]"
          />
        </motion.div>
      </motion.div>
    ) : null;

  const imageBody = !loading && displayUrl && (
    <>
      <Image
        src={displayUrl}
        alt={label ?? "Aura art"}
        width={isCard ? 240 : 640}
        height={isCard ? 360 : 360}
        unoptimized
        className={
          isCard
            ? "block h-auto w-full"
            : `max-h-full max-w-full ${objectFit === "cover" ? "h-full w-full object-cover" : "object-contain"}`
        }
      />
      {canExpand && (
        <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <span className="mb-3 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/90">
            <ZoomIn className="h-3 w-3" />
            Открыть
          </span>
        </span>
      )}
    </>
  );

  return (
    <>
      <div className={`overflow-hidden rounded-xl border border-white/10 bg-black/30 ${className}`}>
        {label && (
          <p className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
            <Sparkles className="h-3 w-3 text-aura-neon" />
            {label}
          </p>
        )}

        {loading && (
          <div
            className={`flex ${aspectClass} w-full items-center justify-center bg-gradient-to-br from-aura-purple/10 to-aura-emerald/5`}
          >
            <Loader2 className="h-6 w-6 animate-spin text-aura-neon/70" />
          </div>
        )}

        {!loading && displayUrl && isCard && (
          <div className="flex justify-center bg-gradient-to-b from-black/50 to-black/30 p-3">
            {canExpand ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group relative max-w-[240px] w-full cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple/60"
                aria-label={label ? `${label} — открыть на весь экран` : "Открыть изображение"}
              >
                {imageBody}
              </button>
            ) : (
              <div className="relative max-w-[240px] w-full rounded-lg">{imageBody}</div>
            )}
          </div>
        )}

        {!loading && displayUrl && !isCard && (
          <div className={`relative flex ${aspectClass} w-full items-center justify-center bg-black/40`}>
            {canExpand ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group relative flex h-full w-full cursor-zoom-in items-center justify-center focus:outline-none"
                aria-label={label ? `${label} — открыть на весь экран` : "Открыть изображение"}
              >
                {imageBody}
              </button>
            ) : (
              imageBody
            )}
          </div>
        )}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>{lightbox}</AnimatePresence>,
          document.body
        )}
    </>
  );
}
