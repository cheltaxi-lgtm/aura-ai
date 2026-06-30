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
import SharePreviewCard from "@/components/share/SharePreviewCard";
import {
  copyToClipboard,
  downloadShareOgImage,
  exportCardAsPng,
  openShareChannel,
  shareViaNative,
} from "@/lib/share/channels-client";
import { buildSharePageUrl, buildShareText } from "@/lib/share/build-url";
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

function exportCardPayload(payload: SharePayload): SharePayload {
  if (!payload.excerpt) return payload;
  return { ...payload, excerpt: cardExcerptFromFull(payload.excerpt) };
}

export default function ShareSheet({ payload, onClose }: Props) {
  const exportRef = useRef<HTMLDivElement>(null);
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
        if (!res.ok) throw new Error(data.error ?? "share_failed");
        if (!data.token || !data.payload) throw new Error("share_failed");
        setToken(data.token);
        setSavedPayload(data.payload);
      })
      .catch(() => setError("Не удалось создать ссылку для шаринга"))
      .finally(() => setLoading(false));
  }, [payload]);

  const sharePayload = savedPayload ?? payload;
  const exportPayload = useMemo(
    () => (sharePayload ? exportCardPayload(sharePayload) : null),
    [sharePayload]
  );

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
        const ok = await downloadShareOgImage(
          token,
          `zovus-${sharePayload.kind}-${Date.now()}.png`
        );
        if (!ok && exportRef.current) {
          const fallback = await exportCardAsPng(
            exportRef.current,
            `zovus-${sharePayload.kind}-${Date.now()}.png`
          );
          showStatus(fallback ? "Картинка сохранена" : "Не удалось сохранить");
        } else {
          showStatus(ok ? "Картинка сохранена" : "Не удалось сохранить");
        }
        trackShareChannel("png", sharePayload.kind);
        return;
      }

      if (channel === "native") {
        const result = await shareViaNative(token, title, excerpt, exportRef.current);
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

              <div className="share-sheet__preview-wrap">
                {loading ? (
                  <div className="share-sheet__loading">
                    <Loader2 className="h-8 w-8 animate-spin text-aura-gold" />
                    <p className="text-sm text-white/50">Готовим ссылку…</p>
                  </div>
                ) : error ? (
                  <p className="share-sheet__error">{error}</p>
                ) : sharePayload ? (
                  <SharePreviewCard payload={sharePayload} />
                ) : null}
              </div>

              {token && sharePayload?.excerpt && !error && (
                <p className="share-sheet__excerpt-preview">{sharePayload.excerpt}</p>
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

      {exportPayload && token && (
        <div className="share-sheet__export-target" aria-hidden>
          <div ref={exportRef}>
            <ShareCard payload={exportPayload} aspect="og" />
          </div>
        </div>
      )}
    </BodyPortal>
  );
}
