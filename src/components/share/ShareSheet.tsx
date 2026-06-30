"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2,
  X,
  Send,
  MessageCircle,
  Copy,
  Download,
  MoreHorizontal,
  Check,
  Loader2,
} from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import ShareCard from "@/components/share/cards/ShareCard";
import {
  copyToClipboard,
  exportCardAsPng,
  openShareChannel,
  shareViaNative,
} from "@/lib/share/channels-client";
import { buildSharePageUrl, buildShareText } from "@/lib/share/build-url";
import { getScaledCardSize, type ShareCardAspect } from "@/lib/share/card-layout";
import { cardExcerptFromFull } from "@/lib/share/sanitize";
import { trackShareChannel, trackShareOpen } from "@/lib/share/metrika";
import type { ShareChannel, SharePayload } from "@/lib/share/types";

interface Props {
  payload: SharePayload | null;
  onClose: () => void;
}

type ChannelDef = {
  id: ShareChannel;
  label: string;
  icon: typeof Send;
};

const CHANNELS: ChannelDef[] = [
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "vk", label: "VK", icon: Share2 },
  { id: "copy", label: "Текст", icon: Copy },
  { id: "png", label: "Картинка", icon: Download },
  { id: "native", label: "Ещё", icon: MoreHorizontal },
];

function cardDisplayPayload(payload: SharePayload): SharePayload {
  if (!payload.excerpt) return payload;
  return {
    ...payload,
    excerpt: cardExcerptFromFull(payload.excerpt),
  };
}

export default function ShareSheet({ payload, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<ShareCardAspect>("og");
  const [previewWidth, setPreviewWidth] = useState(280);
  const [token, setToken] = useState<string | null>(null);
  const [savedPayload, setSavedPayload] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyChannel, setBusyChannel] = useState<ShareChannel | null>(null);

  useEffect(() => {
    if (!payload) {
      setToken(null);
      setSavedPayload(null);
      setError(null);
      setStatus(null);
      return;
    }

    trackShareOpen(payload.kind);
    setLoading(true);
    setError(null);
    setToken(null);
    setSavedPayload(null);

    fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          token?: string;
          payload?: SharePayload;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "share_failed");
        }
        if (!data.token || !data.payload) throw new Error("share_failed");
        setToken(data.token);
        setSavedPayload(data.payload);
      })
      .catch(() => setError("Не удалось создать ссылку для шаринга"))
      .finally(() => setLoading(false));
  }, [payload]);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const width = el.clientWidth - 8;
      if (width > 0) setPreviewWidth(width);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [payload, aspect]);

  const sharePayload = savedPayload ?? payload;
  const cardPayload = useMemo(
    () => (sharePayload ? cardDisplayPayload(sharePayload) : null),
    [sharePayload]
  );
  const scaled = getScaledCardSize(aspect, previewWidth);

  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2500);
  };

  const handleChannel = async (channel: ShareChannel) => {
    if (!sharePayload || !token || busyChannel) return;
    setBusyChannel(channel);
    try {
      const title = sharePayload.title;
      const excerpt = sharePayload.excerpt ?? "";
      const shareUrl = buildSharePageUrl(token, channel);
      const shareText = buildShareText(title, excerpt, shareUrl);

      if (channel === "copy") {
        const ok = await copyToClipboard(shareText);
        showStatus(ok ? "Текст скопирован" : "Не удалось скопировать");
        trackShareChannel("copy", sharePayload.kind);
        return;
      }

      if (channel === "png") {
        if (!cardRef.current) return;
        const ok = await exportCardAsPng(
          cardRef.current,
          `zovus-${sharePayload.kind}-${Date.now()}.png`
        );
        showStatus(ok ? "Картинка сохранена" : "Не удалось сохранить");
        trackShareChannel("png", sharePayload.kind);
        return;
      }

      if (channel === "native") {
        const result = await shareViaNative(token, title, excerpt, cardRef.current);
        if (result === "shared") showStatus("Отправлено");
        else if (result === "copied") showStatus("Скопировано");
        else showStatus("Не удалось поделиться");
        trackShareChannel("native", sharePayload.kind);
        return;
      }

      openShareChannel(channel, token, title, excerpt);
      trackShareChannel(channel, sharePayload.kind);
    } finally {
      setBusyChannel(null);
    }
  };

  return (
    <BodyPortal active={Boolean(payload)}>
      <AnimatePresence>
        {payload && (
          <motion.div
            className="share-sheet-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            role="presentation"
          >
            <motion.div
              className="share-sheet"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="share-sheet__header">
                <div className="share-sheet__header-text">
                  <p className="share-sheet__eyebrow">Поделиться</p>
                  <h2 className="share-sheet__title">{payload.title}</h2>
                </div>
                <button type="button" onClick={onClose} className="share-sheet__close" aria-label="Закрыть">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="share-sheet__aspect-toggle">
                <button
                  type="button"
                  className={aspect === "og" ? "share-sheet__aspect-btn--active" : "share-sheet__aspect-btn"}
                  onClick={() => setAspect("og")}
                >
                  Превью
                </button>
                <button
                  type="button"
                  className={aspect === "story" ? "share-sheet__aspect-btn--active" : "share-sheet__aspect-btn"}
                  onClick={() => setAspect("story")}
                >
                  Stories
                </button>
              </div>

              <div
                ref={previewWrapRef}
                className="share-sheet__preview-wrap"
                style={{ minHeight: scaled.displayHeight + 24 }}
              >
                {loading ? (
                  <div className="share-sheet__loading">
                    <Loader2 className="h-8 w-8 animate-spin text-aura-gold" />
                    <p className="text-sm text-white/50">Готовим карточку…</p>
                  </div>
                ) : error ? (
                  <p className="share-sheet__error">{error}</p>
                ) : cardPayload ? (
                  <div
                    className="share-sheet__preview-viewport"
                    style={{
                      width: scaled.displayWidth,
                      height: scaled.displayHeight,
                    }}
                  >
                    <div
                      className="share-sheet__preview-scaler"
                      style={{
                        width: scaled.width,
                        height: scaled.height,
                        transform: `scale(${scaled.scale})`,
                      }}
                    >
                      <div ref={cardRef}>
                        <ShareCard payload={cardPayload} aspect={aspect} />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {token && sharePayload?.excerpt && !error && (
                <p className="share-sheet__excerpt-preview">
                  {sharePayload.excerpt.length > 120
                    ? `${sharePayload.excerpt.slice(0, 119).trim()}…`
                    : sharePayload.excerpt}
                </p>
              )}

              <div className="share-sheet__channels">
                {CHANNELS.map(({ id, label, icon: Icon }, i) => (
                  <motion.button
                    key={id}
                    type="button"
                    disabled={!token || loading || Boolean(error)}
                    className="share-sheet__channel"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => void handleChannel(id)}
                  >
                    <span className="share-sheet__channel-icon">
                      {busyChannel === id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </span>
                    <span className="share-sheet__channel-label">{label}</span>
                  </motion.button>
                ))}
              </div>

              <AnimatePresence>
                {status && (
                  <motion.p
                    className="share-sheet__status"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <Check className="h-4 w-4 text-aura-emerald" />
                    {status}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}
