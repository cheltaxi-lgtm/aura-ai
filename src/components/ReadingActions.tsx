"use client";

import { useState } from "react";
import Link from "next/link";
import { Share2, Trash2, Loader2, Check, MessageCircle } from "lucide-react";
import { shareReading, type ShareReadingInput } from "@/lib/share-reading";

interface ReadingActionsProps {
  entryId: string;
  share: ShareReadingInput;
  onDeleted?: () => void;
  compact?: boolean;
  /** Ссылка на чат с мастером — показывает кнопку «Продолжить в чате» */
  continueChatHref?: string;
}

export default function ReadingActions({
  entryId,
  share,
  onDeleted,
  compact,
  continueChatHref,
}: ReadingActionsProps) {
  const [deleting, setDeleting] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied" | "error">("idle");

  const handleShare = async () => {
    setShareStatus("idle");
    const result = await shareReading(share);
    if (result === "shared") setShareStatus("shared");
    else if (result === "copied") setShareStatus("copied");
    else setShareStatus("error");
    setTimeout(() => setShareStatus("idle"), 2500);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Удалить этот расклад из истории? Действие нельзя отменить."
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/cabinet/readings/${entryId}`, { method: "DELETE" });
      if (!res.ok) {
        setShareStatus("error");
        return;
      }
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  };

  const shareLabel =
    shareStatus === "shared"
      ? "Отправлено"
      : shareStatus === "copied"
        ? "Скопировано"
        : shareStatus === "error"
          ? "Ошибка"
          : "Поделиться";

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4 border-t border-white/5 pt-4"}`}>
      {continueChatHref && (
        <Link
          href={continueChatHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-aura-purple/50 bg-aura-purple/20 px-4 py-2 text-xs font-semibold text-aura-neon transition-colors hover:border-aura-purple hover:bg-aura-purple/30"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Продолжить в чате
        </Link>
      )}

      <button
        type="button"
        onClick={() => void handleShare()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-aura-purple/40 hover:text-aura-neon"
      >
        {shareStatus === "copied" || shareStatus === "shared" ? (
          <Check className="h-3.5 w-3.5 text-aura-emerald" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {shareLabel}
      </button>

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={deleting}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 px-3 py-2 text-xs text-red-400/90 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Удалить
      </button>
    </div>
  );
}
