"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProShell from "@/modules/pro/ui/ProShell";

interface AvitoChat {
  id: string;
  client_name: string | null;
  item_title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  unread_by_practitioner: boolean;
}

interface AvitoMessage {
  id: string;
  chat_id: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  avito_created_at: string | null;
  created_at: string;
}

function messageText(m: AvitoMessage): string {
  if (m.text) return m.text;
  if (m.type === "image") return "[изображение]";
  if (m.type === "system") return "[системное сообщение]";
  return "[вложение]";
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProAvitoPage() {
  const [chats, setChats] = useState<AvitoChat[]>([]);
  const [stats, setStats] = useState({ total: 0, unread: 0 });
  const [enabled, setEnabled] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<AvitoChat | null>(null);
  const [messages, setMessages] = useState<AvitoMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (unreadOnly) params.set("unread", "1");
    const res = await fetch(`/api/pro/avito/chats?${params}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setChats(data.chats ?? []);
    setStats(data.stats ?? { total: 0, unread: 0 });
    setEnabled(data.enabled !== false);
    setConfigured(data.configured !== false);
    setOwnerOnly(data.ownerOnly === true);
  }, [unreadOnly]);

  const loadChat = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/pro/avito/chats/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setActiveChat(data.chat);
      setMessages(data.messages ?? []);
      void fetch(`/api/pro/avito/chats/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      }).then(() => loadList());
    },
    [loadList]
  );

  useEffect(() => {
    void loadList().finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadChat(selectedId);
  }, [selectedId, loadChat]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => void loadChat(selectedId), 5000);
    return () => clearInterval(timer);
  }, [selectedId, loadChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending || !selectedId) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/pro/avito/chats/${selectedId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "avito_not_configured") throw new Error("Avito API не настроен");
        if (data.status === 402) {
          throw new Error("На аккаунте Avito нет платной подписки на API мессенджера");
        }
        throw new Error("Не удалось отправить");
      }
      setDraft("");
      await loadChat(selectedId);
      void loadList();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/pro/avito/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      await loadList();
      if (selectedId) await loadChat(selectedId);
    } finally {
      setSyncing(false);
    }
  }

  const notReady = !enabled || !configured;

  return (
    <ProShell title="Avito">
      {ownerOnly ? (
        <div className="pro-panel mb-6 text-sm text-[var(--pro-text,#ede6da)]">
          <p className="font-medium">Avito подключён к другому аккаунту</p>
          <p className="mt-1 text-xs text-[var(--pro-faint,#888)]">
            Мессенджер Avito на этой установке привязан к одному аккаунту
            практика. Если это ваш аккаунт — попросите администратора задать
            AVITO_PRO_OWNER_USER_ID.
          </p>
        </div>
      ) : null}
      {notReady && !ownerOnly ? (
        <div className="pro-panel mb-6 text-sm text-[var(--pro-text,#ede6da)]">
          <p className="font-medium">Avito API не активен</p>
          <p className="mt-1 text-xs text-[var(--pro-faint,#888)]">
            {!enabled && "AVITO_ENABLED выключен. "}
            {!configured && "Не заданы AVITO_CLIENT_ID / AVITO_CLIENT_SECRET. "}
            Заполните переменные окружения и перезапустите сервис. Вебхук для
            подписки: <code>/api/avito/webhook?token=…</code>
          </p>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-[var(--pro-faint,#888)]">
        <span>
          Диалогов: <span className="text-[var(--pro-text,#ede6da)]">{stats.total}</span>
        </span>
        <span>
          Непрочитанных:{" "}
          <span className="text-aura-champagne">{stats.unread}</span>
        </span>
        <button
          type="button"
          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          onClick={() => void handleSync()}
          disabled={syncing || notReady}
        >
          {syncing ? "Синхронизация…" : "Синхронизировать с Avito"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* Chat list */}
        <div
          className={`space-y-2 ${selectedId ? "hidden md:block" : ""}`}
        >
          <label className="flex items-center gap-2 px-1 text-xs text-[var(--pro-faint,#888)]">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Только непрочитанные
          </label>
          {loading ? (
            <p className="pro-panel text-xs text-[var(--pro-faint,#888)]">Загрузка…</p>
          ) : chats.length === 0 ? (
            <p className="pro-panel text-xs text-[var(--pro-faint,#888)]">
              Пока пусто — сообщения появятся после вебхука или синхронизации.
            </p>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`pro-panel w-full text-left text-sm transition-opacity hover:opacity-90 ${
                  selectedId === c.id ? "ring-1 ring-aura-gold/40" : ""
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[var(--pro-text,#ede6da)]">
                    {c.client_name ?? "Клиент Avito"}
                  </span>
                  {c.unread_by_practitioner ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-aura-champagne" />
                  ) : null}
                </span>
                {c.item_title ? (
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--pro-faint,#888)]">
                    {c.item_title}
                  </span>
                ) : null}
                {c.last_message_preview ? (
                  <span className="mt-1 block truncate text-xs text-[var(--pro-faint,#888)]">
                    {c.last_message_direction === "out" ? "Вы: " : ""}
                    {c.last_message_preview}
                  </span>
                ) : null}
                <span className="mt-1 block text-[10px] text-[var(--pro-faint,#888)]">
                  {formatTime(c.last_message_at)}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Conversation */}
        <div className={selectedId ? "" : "hidden md:block"}>
          {!selectedId || !activeChat ? (
            <p className="pro-panel text-sm text-[var(--pro-faint,#888)]">
              Выберите диалог слева
            </p>
          ) : (
            <div className="flex h-[calc(100vh-320px)] min-h-[420px] flex-col">
              <div className="pro-panel mb-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="text-xs text-[var(--pro-faint,#888)] md:hidden"
                    onClick={() => {
                      setSelectedId(null);
                      setActiveChat(null);
                    }}
                  >
                    ← Назад
                  </button>
                  <div>
                    <p className="text-sm font-medium text-[var(--pro-text,#ede6da)]">
                      {activeChat.client_name ?? "Клиент Avito"}
                    </p>
                    {activeChat.item_title ? (
                      <p className="text-xs text-[var(--pro-faint,#888)]">
                        {activeChat.item_title}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="pro-panel min-h-0 flex-1 space-y-3 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "ml-auto bg-aura-gold/15 text-[var(--pro-text,#ede6da)]"
                        : "bg-white/5 text-[var(--pro-text,#ede6da)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{messageText(m)}</p>
                    <p className="mt-1 text-[10px] text-[var(--pro-faint,#888)]">
                      {m.direction === "out" ? "Вы · " : ""}
                      {formatTime(m.avito_created_at ?? m.created_at)}
                    </p>
                  </div>
                ))}
                {messages.length === 0 ? (
                  <p className="text-xs text-[var(--pro-faint,#888)]">
                    Сообщений пока нет
                  </p>
                ) : null}
                <div ref={bottomRef} />
              </div>

              <div className="mt-3">
                {sendError ? (
                  <p className="mb-2 text-xs text-red-400">{sendError}</p>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea
                    className="pro-field min-h-[44px] flex-1"
                    placeholder={notReady ? "Avito API не настроен" : "Сообщение клиенту…"}
                    value={draft}
                    disabled={notReady || sending}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
                    onClick={() => void handleSend()}
                    disabled={notReady || sending || !draft.trim()}
                  >
                    {sending ? "…" : "Отправить"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProShell>
  );
}
