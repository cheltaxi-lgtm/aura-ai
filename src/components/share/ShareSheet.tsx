"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2,
  X,
  Send,
  Copy,
  MoreHorizontal,
  Check,
  Loader2,
  RefreshCw,
  Download,
} from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import SharePreviewCard from "@/components/share/SharePreviewCard";
import {
  copyToClipboard,
  downloadShareOgImage,
  openShareChannel,
  shareViaNative,
} from "@/lib/share/channels-client";
import { buildSharePageUrl, type ShareMessageInput } from "@/lib/share/build-url";
import {
  trackShareChannel,
  trackShareCopyFail,
  trackShareCopySuccess,
  trackShareCreateFail,
  trackShareCreateSuccess,
  trackShareOpen,
} from "@/lib/share/metrika";
import type { ShareChannel, SharePayload, SharePublicPayload } from "@/lib/share/types";
import type { ShareChannelSettings } from "@/lib/share/settings";

interface Props {
  payload: SharePayload | null;
  onClose: () => void;
  channels?: ShareChannelSettings;
}

type ChannelDef = {
  id: ShareChannel;
  label: string;
  icon: typeof Send;
};

const ALL_CHANNELS: ChannelDef[] = [
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "vk", label: "VK", icon: Share2 },
  { id: "native", label: "Ещё", icon: MoreHorizontal },
  { id: "copy", label: "Ссылка", icon: Copy },
  { id: "download", label: "PNG", icon: Download },
];

const DEFAULT_CHANNELS: ShareChannelSettings = {
  telegram: true,
  vk: true,
  native: true,
  copy: true,
  download: false,
};

export default function ShareSheet({ payload, onClose, channels = DEFAULT_CHANNELS }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [savedPayload, setSavedPayload] = useState<SharePublicPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyChannel, setBusyChannel] = useState<ShareChannel | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const createSnapshot = (nextPayload: SharePayload) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    trackShareOpen(nextPayload.kind);
    setLoading(true);
    setError(null);
    setToken(null);
    setSavedPayload(null);

    fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPayload),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          token?: string;
          payload?: SharePublicPayload;
          error?: string;
        };
        if (!res.ok || !data.token) throw new Error(data.error ?? "share_failed");
        if (requestId !== requestIdRef.current) return;

        setToken(data.token);
        trackShareCreateSuccess(nextPayload.kind);

        const snapRes = await fetch(`/api/share/${encodeURIComponent(data.token)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (snapRes.ok) {
          const snap = (await snapRes.json()) as { payload?: SharePublicPayload };
          if (snap.payload) {
            setSavedPayload(snap.payload);
            return;
          }
        }
        if (data.payload) setSavedPayload(data.payload);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        if (requestId !== requestIdRef.current) return;
        trackShareCreateFail(nextPayload.kind);
        setError("Не удалось создать ссылку для шаринга");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    if (!payload) {
      abortRef.current?.abort();
      setToken(null);
      setSavedPayload(null);
      setError(null);
      setStatus(null);
      return;
    }
    createSnapshot(payload);
    return () => abortRef.current?.abort();
  }, [payload]);

  const sharePayload = savedPayload;
  const cleanUrl = token ? buildSharePageUrl(token) : "";

  const shareMessageInput: ShareMessageInput | null = sharePayload
    ? {
        title: sharePayload.title,
        masterName: sharePayload.masterName,
        excerpt: sharePayload.excerpt,
        kind: sharePayload.kind,
        cards: sharePayload.cards?.map((c) => c.name),
        date: sharePayload.date,
      }
    : null;

  const visibleChannels = ALL_CHANNELS.filter((ch) => channels[ch.id] !== false);

  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 2500);
  };

  const handleChannel = async (channel: ShareChannel) => {
    if (!sharePayload || !token || !shareMessageInput || busyChannel) return;
    setBusyChannel(channel);
    try {
      if (channel === "copy") {
        const ok = await copyToClipboard(cleanUrl);
        showStatus(ok ? "Ссылка скопирована" : "Не удалось скопировать");
        if (ok) trackShareCopySuccess(sharePayload.kind);
        else trackShareCopyFail(sharePayload.kind);
        trackShareChannel("copy", sharePayload.kind);
        return;
      }

      if (channel === "download") {
        const ok = await downloadShareOgImage(token, `zovus-${token}.png`);
        showStatus(ok ? "Картинка сохранена" : "Не удалось сохранить PNG");
        trackShareChannel("download", sharePayload.kind);
        return;
      }

      if (channel === "native") {
        const result = await shareViaNative(token, shareMessageInput);
        if (result === "shared") showStatus("Отправлено");
        else if (result === "copied") showStatus("Скопировано");
        else showStatus("Не удалось поделиться");
        trackShareChannel("native", sharePayload.kind);
        return;
      }

      openShareChannel(channel, token, shareMessageInput);
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
                    <p className="text-sm text-white/50">Создаём ссылку…</p>
                  </div>
                ) : error ? (
                  <div className="share-sheet__error-wrap">
                    <p className="share-sheet__error">{error}</p>
                    <button
                      type="button"
                      className="share-sheet__retry"
                      onClick={() => payload && createSnapshot(payload)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Повторить
                    </button>
                  </div>
                ) : sharePayload && token ? (
                  <SharePreviewCard
                    token={token}
                    title={sharePayload.title}
                    masterName={sharePayload.masterName}
                    excerpt={sharePayload.excerpt}
                    kind={sharePayload.kind}
                    cards={sharePayload.cards?.map((c) => c.name)}
                    date={sharePayload.date}
                    cleanUrl={cleanUrl}
                  />
                ) : null}
              </div>

              <div
                className={`share-sheet__channels ${
                  visibleChannels.length >= 5 ? "share-sheet__channels--5" : "share-sheet__channels--4"
                }`}
              >
                {visibleChannels.map(({ id, label, icon: Icon }, i) => (
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
