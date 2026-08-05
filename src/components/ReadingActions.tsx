"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, Loader2, MessageCircle } from "lucide-react";
import ShareButton from "@/components/share/ShareButton";
import { shareInputToPayload } from "@/lib/share-reading";
import type { ShareReadingInput } from "@/lib/share-reading";

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
  const [deleteError, setDeleteError] = useState(false);

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Удалить этот расклад из истории? Действие нельзя отменить."
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError(false);
    try {
      const res = await fetch(`/api/cabinet/readings/${entryId}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError(true);
        return;
      }
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4 border-t border-white/5 pt-4"}`}>
      {continueChatHref && (
        <Link
          href={continueChatHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-aura-gold/50 bg-aura-gold/20 px-4 py-2 text-xs font-semibold text-aura-champagne transition-colors hover:border-aura-gold hover:bg-aura-gold/30"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Продолжить в чате
        </Link>
      )}

      <ShareButton payload={shareInputToPayload(share, "reading")} variant="pill" />

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
        {deleteError ? "Ошибка" : "Удалить"}
      </button>
    </div>
  );
}
