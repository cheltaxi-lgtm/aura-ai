"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { isSupportSystemSender } from "@/lib/support-constants";
import { useNativeInputSync } from "@/lib/use-native-input-sync";

export interface SupportMessage {
  id: string;
  sender_type: "user" | "admin";
  sender_id?: string;
  content: string;
  created_at: string;
}

interface Props {
  messages: SupportMessage[];
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  disabledHint?: string;
  viewerRole: "user" | "admin";
  pollingMs?: number;
  onPoll?: () => Promise<SupportMessage[]>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportChat({
  messages,
  onSend,
  disabled,
  disabledHint,
  viewerRole,
  pollingMs = 8000,
  onPoll,
}: Props) {
  const [text, setText] = useState("");
  const textSyncRef = useNativeInputSync<HTMLTextAreaElement>(setText);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length !== prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCount.current = messages.length;
    }
  }, [messages.length]);

  useEffect(() => {
    if (!onPoll) return;
    const timer = setInterval(() => void onPoll(), pollingMs);
    return () => clearInterval(timer);
  }, [onPoll, pollingMs]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      await onSend(content);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col rounded-2xl border border-white/10 bg-black/20">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">Сообщений пока нет</p>
        ) : (
          messages.map((msg) => {
            const isMine =
              (viewerRole === "user" && msg.sender_type === "user") ||
              (viewerRole === "admin" && msg.sender_type === "admin");
            return (
              <div
                key={msg.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isMine
                      ? "bg-aura-purple/25 text-white"
                      : "border border-white/10 bg-white/5 text-gray-200"
                  }`}
                >
                  {!isMine && viewerRole === "admin" ? (
                    <p className="mb-1 text-[10px] font-medium uppercase text-aura-neon/70">
                      Клиент
                    </p>
                  ) : null}
                  {!isMine && viewerRole === "user" ? (
                    <p className="mb-1 text-[10px] font-medium uppercase text-amber-400/80">
                      Поддержка
                    </p>
                  ) : null}
                  {isMine && viewerRole === "admin" && msg.sender_id && isSupportSystemSender(msg.sender_id) ? (
                    <p className="mb-1 text-[10px] font-medium uppercase text-gray-500">
                      Автоответ
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="mt-1 text-[10px] text-gray-500">{formatTime(msg.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 p-3">
        {disabled && disabledHint ? (
          <p className="mb-2 text-center text-xs text-gray-500">{disabledHint}</p>
        ) : null}
        {error ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Закрыть">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <textarea
            ref={textSyncRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder={disabled ? "Чат закрыт" : "Напишите сообщение…"}
            rows={2}
            className="flex-1 touch-auto select-text resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-aura-purple/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={disabled || sending || !text.trim()}
            className="flex h-auto items-center justify-center rounded-xl bg-aura-purple/30 px-4 text-aura-neon transition-colors hover:bg-aura-purple/40 disabled:opacity-40"
            aria-label="Отправить"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SupportStatusBadge({
  status,
  labels,
}: {
  status: string;
  labels: Record<string, string>;
}) {
  const color =
    status === "open"
      ? "bg-blue-500/20 text-blue-300"
      : status === "in_progress"
        ? "bg-amber-500/20 text-amber-300"
        : status === "waiting_user"
          ? "bg-purple-500/20 text-purple-300"
          : status === "resolved"
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-gray-500/20 text-gray-400";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {labels[status] ?? status}
    </span>
  );
}
